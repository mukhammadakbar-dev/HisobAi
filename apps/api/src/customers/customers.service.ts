import { Injectable } from '@nestjs/common';
import {
  ContractStatus,
  Currency,
  ErrorCode,
  UserRole,
  sumMoney,
  type CreateCustomerInput,
  type CustomerDebtDto,
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
import { outstandingOfRows } from '../payments/allocation.service';

/**
 * Mijozlar (§6).
 *
 * **Passport rasmi** (§6.6, §6.7) bu servisda **ataylab yo'q** —
 * `Storage` moduli bilan birga 9-bosqichda, §18.1 dagi mahsulot rasmi
 * bilan bir xil sabab. `passport_file_id` ustuni schema'da allaqachon
 * bor.
 *
 * **Qarz** (§6.11, §6.12) — ustunda ham, kirish maydonida ham **yo'q va
 * bo'lmaydi**: u savdo va to'lovlardan hisoblanadi, qo'lda yozish yo'li
 * ochilmasin. Lekin DTO'da bor: `toSummaryDto`/`toDto` `debt` maydonini
 * `debtByCustomer()` natijasidan oladi — bu ULANMAGAN UCH endi bog'landi
 * (T-09). Formula qayta yozilmagan: `AllocationService.outstandingOfRows`
 * qayta ishlatiladi (`ReportsService.debtors()`, `DashboardService.credit()`
 * bilan bir xil manba).
 */

/** Telefon bo'yicha qidiruv uchun eng kam raqam soni. */
const MIN_PHONE_DIGITS = 3;

/** §6.11 — barqaror tartib uchun: `Currency` enum tartibida (UZS, USD). */
const CURRENCY_ORDER = Object.values(Currency);

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ──────────────────────────── O'qish ────────────────────────────

  /**
   * §6.4 — qidiruv ism va **ikkala** telefon bo'yicha ishlaydi.
   *
   * Qarz **sahifadagi barcha mijozlar uchun bitta qo'shimcha so'rov**
   * bilan olinadi (`debtByCustomer`), har qator uchun alohida emas —
   * aks holda 50 mijozli sahifa 50 ta qo'shimcha so'rov qilardi (N+1).
   */
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

    const debts = await this.debtByCustomer(rows.map((row) => row.id));

    return toPage(
      rows.map((row) => toSummaryDto(row, debts.get(row.id) ?? [])),
      limit,
      (dto) => (column === 'fullName' ? dto.fullName : dto.createdAt),
    );
  }

  async requireById(id: string, actor: RequestUser): Promise<CustomerDto> {
    const row = await this.prisma.customer.findUnique({ where: { id } });
    if (!row) throw AppException.notFound(ErrorCode.NOT_FOUND, 'Mijoz topilmadi.');
    const debts = await this.debtByCustomer([id]);
    return toDto(row, canSeePassport(actor), debts.get(id) ?? []);
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

    await this.audit.recordDetached(actor.shopId, {
      actorId: actor.id,
      action: 'CUSTOMER_CREATED',
      entityType: 'Customer',
      entityId: created.id,
      after: auditView(created),
      ip,
    });

    // Qo'shimcha so'rov shart emas: yangi mijozning `id`si shu zahotgacha
    // mavjud emas edi, ya'ni unga bog'langan savdo/shartnoma bo'lishi
    // FIZIK JIHATDAN mumkin emas (FK yangi qatorni oldindan bila olmaydi) —
    // qarz har doim bo'sh massiv
    return toDto(created, canSeePassport(actor), []);
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
    /**
     * "Bu raqam kimda bor" degan savolga javob **tranzaksiyadan
     * TASHQARIDA** olinadi (§23.13).
     *
     * Ikki sabab, ikkalasi ham hal qiluvchi:
     *
     *  - tranzaksiya ichidan `this.prisma` ga qilingan so'rov boshqa
     *    ulanishga tushadi, u yerda `app.current_shop_id` qo'yilmagan
     *    va RLS hamma qatorni to'sadi — natijada mijoz topilmay,
     *    xabar "raqam band" degan umumiy matnga tushib qolardi;
     *  - unique buzilishidan keyin tranzaksiyaning O'ZI abort holatida,
     *    ya'ni `tx` orqali so'rash ham ishlamasdi.
     *
     * Shuning uchun ichkarida xato shunchaki yuqoriga uzatiladi va
     * bu yerda boyitiladi.
     */
    try {
      const after = await this.updateInTransaction(id, input, precondition, actor, ip);
      // Qarz tahrirlash tranzaksiyasi bilan bog'liq EMAS (boshqa jadval),
      // shuning uchun tranzaksiya tugagach, oddiy o'qish bilan olinadi —
      // aks holda tahrirlangan mijoz javobida eskirgan (masalan bo'sh)
      // qarz qaytardi
      const debts = await this.debtByCustomer([id]);
      return toDto(after, canSeePassport(actor), debts.get(id) ?? []);
    } catch (error) {
      if (isUniqueViolation(error) && input.phonePrimary) {
        throw await this.phoneTaken(input.phonePrimary);
      }
      throw error;
    }
  }

  private async updateInTransaction(
    id: string,
    input: UpdateCustomerInput,
    precondition: Precondition,
    actor: RequestUser,
    ip: string | null,
  ): Promise<Customer> {
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
          // Unique buzilishi yuqoriga uzatiladi — xabarni `update()` boyitadi
          if (!isRecordNotFound(error)) throw error;

          const current = await tx.customer.findUnique({ where: { id } });
          throw staleResource(current?.updatedAt ?? before.updatedAt, precondition.expected);
        });

      const changes = auditDiff(auditView(before), auditView(after));
      if (hasChanges(changes)) {
        await this.audit.record(tx, actor.shopId, {
          actorId: actor.id,
          action: 'CUSTOMER_UPDATED',
          entityType: 'Customer',
          entityId: id,
          before: changes.before,
          after: changes.after,
          ip,
        });
      }

      return after;
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

  /**
   * §6.11, §6.12 — bir nechta mijozning joriy qarzi, **bitta so'rov**da.
   *
   * `customerId → CustomerDebtDto[]` xaritasi qaytariladi: chaqiruvchi
   * (`list`, `requireById`, `update`) uni xotirada guruhlaydi, har mijoz
   * uchun alohida so'rov qilmaydi — N+1 shu yerda oldi olinadi.
   *
   * Manba — `ReportsService.debtors()` va `DashboardService.credit()`
   * bilan **bir xil**: faqat `ACTIVE` nasiya shartnomalari (`CLOSED`/
   * `CANCELLED` qarz bermaydi, §17.18), ularning `schedules` qatorlari,
   * formula esa `outstandingOfRows` (`AllocationService`) — takrorlanmaydi.
   */
  private async debtByCustomer(customerIds: string[]): Promise<Map<string, CustomerDebtDto[]>> {
    const map = new Map<string, CustomerDebtDto[]>();
    if (customerIds.length === 0) return map;

    const contracts = await this.prisma.installmentContract.findMany({
      where: { status: ContractStatus.ACTIVE, sale: { customerId: { in: customerIds } } },
      select: {
        currency: true,
        sale: { select: { customerId: true } },
        schedules: { select: { amountDue: true, amountPaid: true } },
      },
    });

    // customerId → valyuta → shartnomalarning qoldiqlari (`sumMoney`ga
    // kiritish uchun) — har shartnoma o'z valyutasida qoladi (§1.3)
    const amountsByCustomer = new Map<string, Map<Currency, string[]>>();

    for (const contract of contracts) {
      // §9.1 — nasiya savdo mijozsiz tasdiqlanmaydi, ya'ni amalda bu
      // holat bo'lmaydi; tekshiruv faqat tip xavfsizligi uchun
      // (`Sale.customerId` nullable — naqd savdoda mijoz ixtiyoriy)
      const customerId = contract.sale.customerId;
      if (!customerId) continue;

      const outstanding = outstandingOfRows(contract.schedules);
      // §16.11 — ifodalab bo'lmaydigan qoldiq yopilmagan shartnomada
      // ham qolishi mumkin, lekin u ro'yxatda "qarz" sifatida chiqmaydi
      if (Number(outstanding) <= 0) continue;

      const byCurrency = amountsByCustomer.get(customerId) ?? new Map<Currency, string[]>();
      const amounts = byCurrency.get(contract.currency) ?? [];
      amounts.push(outstanding);
      byCurrency.set(contract.currency, amounts);
      amountsByCustomer.set(customerId, byCurrency);
    }

    for (const [customerId, byCurrency] of amountsByCustomer) {
      const debt: CustomerDebtDto[] = CURRENCY_ORDER.filter((currency) =>
        byCurrency.has(currency),
      ).map((currency) => ({
        currency,
        amount: sumMoney(byCurrency.get(currency) ?? [], currency),
      }));
      map.set(customerId, debt);
    }

    return map;
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

function toSummaryDto(row: Customer, debt: CustomerDebtDto[]): CustomerSummaryDto {
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
    debt,
  };
}

function toDto(row: Customer, withPassport: boolean, debt: CustomerDebtDto[]): CustomerDto {
  return {
    ...toSummaryDto(row, debt),
    address: row.address,
    note: row.note,
    passportSeries: withPassport ? row.passportSeries : null,
    passportNumber: withPassport ? row.passportNumber : null,
    pinfl: withPassport ? row.pinfl : null,
    hasPassportFile: row.passportFileId !== null,
  };
}
