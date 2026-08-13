import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  UserRole,
  type CreateCustomerInput,
  type CustomerDto,
  type CustomerQuery,
  type CustomerSummaryDto,
  type Page,
  type UpdateCustomerInput,
} from '@hisobai/contracts';
import type { Customer, Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { auditDiff, hasChanges } from '../common/audit-diff';
import { staleResource, type Precondition } from '../common/optimistic-lock';
import { normalizeLimit, toPage, toPrismaCursor } from '../common/pagination';
import { isRecordNotFound, isUniqueViolation } from '../common/prisma-errors';
import type { RequestUser } from '../common/request-user';
import { containsInsensitive } from '../common/search';
import { PrismaService } from '../database/prisma.service';

/**
 * Mijozlar (§6).
 *
 * Ikkita narsa bu servisda **ataylab yo'q**:
 *
 *  - **Qarz** (§6.11, §6.12) — u savdo va to'lovlardan hisoblanadi,
 *    saqlanmaydi. Modullar 5- va 7-bosqichda keladi; ustun ham,
 *    maydon ham qo'shilmaydi, aks holda qo'lda yozish yo'li ochilardi.
 *  - **Passport rasmi** (§6.6, §6.7) — `Storage` moduli bilan birga
 *    9-bosqichda, §18.1 dagi mahsulot rasmi bilan bir xil sabab.
 *    `passport_file_id` ustuni schema'da allaqachon bor.
 */

/** Telefon bo'yicha qidiruv uchun eng kam raqam soni. */
const MIN_PHONE_DIGITS = 3;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ──────────────────────────── O'qish ────────────────────────────

  /** §6.4 — qidiruv ism va **ikkala** telefon bo'yicha ishlaydi. */
  async list(query: CustomerQuery): Promise<Page<CustomerSummaryDto>> {
    const limit = normalizeLimit(query.limit);
    const [column, direction] = parseSort(query.sort);

    const rows = await this.prisma.customer.findMany({
      where: buildWhere(query),
      // `id` ikkilamchi tartib — bir xil ismli mijozlarda sahifa
      // chegarasi beqaror bo'lib, yozuv ikki marta chiqmasin
      orderBy: [{ [column]: direction }, { id: direction }],
      ...toPrismaCursor(query.cursor, limit),
    });

    return toPage(rows.map(toSummaryDto), limit, (dto) =>
      column === 'fullName' ? dto.fullName : dto.createdAt,
    );
  }

  async requireById(id: string, actor: RequestUser): Promise<CustomerDto> {
    const row = await this.prisma.customer.findUnique({ where: { id } });
    if (!row) throw AppException.notFound(ErrorCode.NOT_FOUND, 'Mijoz topilmadi.');
    return toDto(row, canSeePassport(actor));
  }

  // ──────────────────────────── Yozish ────────────────────────────

  /**
   * §6.2 — telefon sxemada E.164 ga keltirilgan, ustundagi `@unique`
   * esa dublikatni to'sadi.
   *
   * Tekshiruv "avval `SELECT`, keyin `INSERT`" bilan qilinmaydi: bu
   * TOCTOU poygasi bo'lardi (§17.5). Indeks xatosi ushlanadi va
   * mijozning **nomi** bilan tushunarli javobga aylantiriladi (§6.3).
   */
  async create(
    input: CreateCustomerInput,
    actor: RequestUser,
    ip: string | null,
  ): Promise<CustomerDto> {
    const created = await this.prisma.customer
      .create({ data: toCreateData(input) })
      .catch(async (error: unknown) => {
        if (!isUniqueViolation(error)) throw error;
        throw await this.phoneTaken(input.phonePrimary);
      });

    await this.audit.recordDetached({
      actorId: actor.id,
      action: 'CUSTOMER_CREATED',
      entityType: 'Customer',
      entityId: created.id,
      after: auditView(created),
      ip,
    });

    return toDto(created, canSeePassport(actor));
  }

  /**
   * Tahrirlash, belgilash (§6.9) va arxivlash (§6.13).
   *
   * Belgi sababi sxemada tekshiriladi, bazada esa
   * `customers_flag_has_reason` CHECK bor. Uchinchi tekshiruv shu
   * yerda **yozilmaydi** — u ikkovidan chetga chiqadigan uchinchi
   * haqiqat manbai bo'lardi.
   */
  async update(
    id: string,
    input: UpdateCustomerInput,
    precondition: Precondition,
    actor: RequestUser,
    ip: string | null,
  ): Promise<CustomerDto> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.customer.findUnique({ where: { id } });
      if (!before) throw AppException.notFound(ErrorCode.NOT_FOUND, 'Mijoz topilmadi.');

      // `updatedAt` `WHERE` da — tekshiruv va yozuv bitta atomik amal (§17.5 naqshi)
      const after = await tx.customer
        .update({
          where: { id, updatedAt: precondition.updatedAt },
          data: toUpdateData(input, canSeePassport(actor)),
        })
        .catch(async (error: unknown) => {
          if (isUniqueViolation(error) && input.phonePrimary) {
            throw await this.phoneTaken(input.phonePrimary);
          }
          if (!isRecordNotFound(error)) throw error;

          const current = await tx.customer.findUnique({ where: { id } });
          throw staleResource(current?.updatedAt ?? before.updatedAt, precondition.expected);
        });

      const changes = auditDiff(auditView(before), auditView(after));
      if (hasChanges(changes)) {
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'CUSTOMER_UPDATED',
          entityType: 'Customer',
          entityId: id,
          before: changes.before,
          after: changes.after,
          ip,
        });
      }

      return toDto(after, canSeePassport(actor));
    });
  }

  /**
   * §6.3 — "Bu raqam Alisher Karimovda bor. O'shami?"
   *
   * Javobda mijozning **nomi** bo'ladi: usiz ega "raqam band" degan
   * xabarni olib, uni kimda ekanini qidirib yurishga majbur bo'lardi.
   * Arxivdagi mijoz ham raqamni band qilib turadi — UI uni tiklashni
   * taklif qila oladi.
   */
  private async phoneTaken(phone: string): Promise<AppException> {
    // `findFirst` — `findUnique` EMAS: unique cheklov endi `(shopId,
    // phonePrimary)` (§14.5), va `shopId`ni bu yerda qo'lda qo'shish
    // §21.7 ni buzardi. Buning hojati ham yo'q: `Customer` shop-scoped
    // model, RLS/extension so'rovni allaqachon joriy Shop bilan
    // cheklaydi — `phonePrimary` yolg'iz o'zi qidiruv uchun yetarli.
    const existing = await this.prisma.customer.findFirst({
      where: { phonePrimary: phone },
      select: { id: true, fullName: true, isActive: true },
    });

    return AppException.conflict(
      ErrorCode.CUSTOMER_PHONE_TAKEN,
      existing ? `Bu raqam ${existing.fullName}da bor.` : 'Bu telefon raqami boshqa mijozda bor.',
      existing
        ? { existingId: existing.id, fullName: existing.fullName, isActive: existing.isActive }
        : undefined,
    );
  }
}

// ────────────────────────── Yordamchilar ──────────────────────────

function buildWhere(query: CustomerQuery): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = {};

  if (query.isActive !== 'all') where.isActive = query.isActive === 'active';
  if (query.isFlagged) where.isFlagged = query.isFlagged === 'true';
  if (!query.q) return where;

  /**
   * Telefon bazada E.164 (`+998901234567`), qidiruvda esa odam
   * "90 123 45 67" deb yozadi. Ajratgichlar olib tashlanmasa, telefon
   * bo'yicha qidiruv **hech qachon** ishlamasdi.
   */
  const digits = query.q.replace(/\D/gu, '');
  where.OR = [
    { fullName: containsInsensitive(query.q) },
    ...(digits.length >= MIN_PHONE_DIGITS
      ? [
          { phonePrimary: containsInsensitive(digits) },
          { phoneSecondary: containsInsensitive(digits) },
        ]
      : []),
  ];

  return where;
}

function parseSort(sort: CustomerQuery['sort']): ['fullName' | 'createdAt', 'asc' | 'desc'] {
  if (sort === '-createdAt') return ['createdAt', 'desc'];
  return ['fullName', sort === '-fullName' ? 'desc' : 'asc'];
}

function toCreateData(input: CreateCustomerInput): Prisma.CustomerUncheckedCreateInput {
  return {
    fullName: input.fullName,
    phonePrimary: input.phonePrimary,
    phoneSecondary: input.phoneSecondary,
    address: input.address,
    note: input.note,
    passportSeries: input.passportSeries,
    passportNumber: input.passportNumber,
    pinfl: input.pinfl,
  };
}

/**
 * §6.5, §6.7 — passport ma'lumotini kim ko'radi.
 *
 * `PERMISSIONS.md` §1 buni **serializatsiya darajasida** hal qilishni
 * talab qiladi, endpoint darajasida emas: `SELLER` mijoz kartasini
 * ochadi, lekin passportni ko'rmaydi. MVP'da faqat `OWNER` bor, ya'ni
 * hozir bu har doim `true` — lekin tekshiruv **serverda** turadi.
 * UI'da qolsa, rol qo'shilgan kuni ma'lumot javobda ochiq ketaverardi
 * va buni hech kim sezmasdi.
 */
function canSeePassport(actor: RequestUser): boolean {
  return actor.role === UserRole.SHOP_ADMIN;
}

function toUpdateData(
  input: UpdateCustomerInput,
  withPassport: boolean,
): Prisma.CustomerUncheckedUpdateInput {
  const data: Prisma.CustomerUncheckedUpdateInput = {};

  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.phonePrimary !== undefined) data.phonePrimary = input.phonePrimary;
  if (input.phoneSecondary !== undefined) data.phoneSecondary = input.phoneSecondary;
  if (input.address !== undefined) data.address = input.address;
  if (input.note !== undefined) data.note = input.note;
  /**
   * Ko'ra olmaydigan rol yoza ham olmaydi — va yozuv **e'tiborsiz
   * qoldiriladi**, xatoga aylantirilmaydi. Sabab: bunday so'rov faqat
   * eski yoki noto'g'ri client'dan keladi, javobda esa maydonlar
   * baribir yo'q. Rad etish o'rniga tegmaslik ma'lumotni saqlaydi —
   * `null` yozib yuborish esa uni yo'q qilardi.
   */
  if (withPassport) {
    if (input.passportSeries !== undefined) data.passportSeries = input.passportSeries;
    if (input.passportNumber !== undefined) data.passportNumber = input.passportNumber;
    if (input.pinfl !== undefined) data.pinfl = input.pinfl;
  }
  if (input.isActive !== undefined) data.isActive = input.isActive;

  /**
   * Belgi olib tashlanganda sabab ham tozalanadi.
   *
   * Usiz `is_flagged = false` va `flag_reason = "..."` juftligi qolib
   * ketardi: keyin belgi qayta qo'yilsa, eskirgan sabab qaytib
   * chiqardi. `customers_flag_has_reason` bunga ruxsat beradi —
   * CHECK faqat teskarisini (sababsiz belgi) to'sadi.
   */
  if (input.isFlagged !== undefined) {
    data.isFlagged = input.isFlagged;
    data.flagReason = input.isFlagged ? (input.flagReason ?? null) : null;
  } else if (input.flagReason !== undefined) {
    data.flagReason = input.flagReason;
  }

  return data;
}

function auditView(row: Customer): Record<string, unknown> {
  return {
    fullName: row.fullName,
    phonePrimary: row.phonePrimary,
    phoneSecondary: row.phoneSecondary,
    address: row.address,
    note: row.note,
    // Passport raqamlari audit'ga tushmaydi — jurnal shaxsga doir
    // ma'lumotning ikkinchi nusxasiga aylanmasin (§16.13). O'zgargani
    // fakt sifatida qoladi
    hasPassport: Boolean(row.passportSeries ?? row.passportNumber ?? row.pinfl),
    isFlagged: row.isFlagged,
    flagReason: row.flagReason,
    isActive: row.isActive,
  };
}

function toSummaryDto(row: Customer): CustomerSummaryDto {
  return {
    id: row.id,
    fullName: row.fullName,
    phonePrimary: row.phonePrimary,
    phoneSecondary: row.phoneSecondary,
    isFlagged: row.isFlagged,
    flagReason: row.flagReason,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDto(row: Customer, withPassport: boolean): CustomerDto {
  return {
    ...toSummaryDto(row),
    address: row.address,
    note: row.note,
    passportSeries: withPassport ? row.passportSeries : null,
    passportNumber: withPassport ? row.passportNumber : null,
    pinfl: withPassport ? row.pinfl : null,
    hasPassportFile: row.passportFileId !== null,
  };
}
