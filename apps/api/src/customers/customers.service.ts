import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BASE_CURRENCY,
  ContractStatus,
  CustomerDebtStatus,
  ErrorCode,
  FileKind,
  ScheduleStatus,
  UserRole,
  sumMoney,
  type CreateCustomerInput,
  type CustomerDto,
  type CustomerListResponse,
  type CustomerQuery,
  type CustomerSummaryDto,
  type UpdateCustomerInput,
} from '@hisobai/contracts';
import { Prisma, type Customer } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { auditDiff, hasChanges } from '../common/audit-diff';
import { businessDay, toCalendarDate } from '../common/dates';
import type { Env } from '../config/env';
import { requireFileRef } from '../common/file-ref';
import { staleResource, type Precondition } from '../common/optimistic-lock';
import { normalizeLimit, toPage, toPrismaCursor } from '../common/pagination';
import { isRecordNotFound, isUniqueViolation } from '../common/prisma-errors';
import type { RequestUser } from '../common/request-user';
import { containsInsensitive } from '../common/search';
import { PrismaService } from '../database/prisma.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { outstandingOfRows } from '../payments/allocation.service';
import { convert } from '../sales/sales.service';

/** §6.12, §9.8 kengaytma — muddati yaqin deb hisoblanadigan kunlar soni. */
const DUE_SOON_DAYS = 3;

/**
 * Mijozlar (§6).
 *
 * **Qarz** (§6.11, §6.12) bu servisda **ataylab yo'q** — u savdo va
 * to'lovlardan hisoblanadi, saqlanmaydi. Ustun ham, maydon ham
 * qo'shilmaydi, aks holda qo'lda yozish yo'li ochilardi.
 *
 * **Passport rasmi** (§6.6, §6.7, §19.2) — 10-bosqich C qismida
 * ochildi: matn maydonlari kabi faqat `canSeePassport()` uchun
 * to'ldiriladi/yoziladi, egalik va `kind` esa `requireFileRef` bilan.
 */

/** Telefon bo'yicha qidiruv uchun eng kam raqam soni. */
const MIN_PHONE_DIGITS = 3;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly rates: ExchangeRatesService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get timeZone(): string {
    return this.config.get('TIMEZONE', { infer: true });
  }

  // ──────────────────────────── O'qish ────────────────────────────

  /**
   * §6.4 — qidiruv ism va **ikkala** telefon bo'yicha ishlaydi.
   *
   * §6.12, §9.8 kengaytma — "Qarzi bor" filtri va sarlavhadagi "jami
   * qarz". Qarz **saqlanmaydi**, shuning uchun filtr bevosita `Customer`
   * ustida qurilmaydi: avval do'kon ichidagi FAOL shartnomalar
   * `sale.customer` orqali joriy filtrga mos mijozlar bo'yicha
   * guruhlanadi (`debtsByCustomer`), shu to'plamdan `hasDebt` va
   * `totalDebt` chiqariladi. Do'kon miqyosi yuzlab mijoz (`ARCHITECTURE.md`)
   * — bu ikkinchi so'rov arzon, keshlanadigan ustunga hojat yo'q.
   */
  async list(query: CustomerQuery): Promise<CustomerListResponse> {
    const limit = normalizeLimit(query.limit);
    const [column, direction] = parseSort(query.sort);

    const baseWhere = buildWhere(query);
    const debts = await this.debtsByCustomer(baseWhere);

    let where = baseWhere;
    let totalDebt = '0.00';
    if (query.hasDebt === 'true') {
      where = { ...baseWhere, id: { in: [...debts.keys()] } };
      totalDebt = sumMoney([...debts.values()].map((debt) => debt.outstandingDebt), BASE_CURRENCY);
    } else if (query.hasDebt === 'false') {
      where = { ...baseWhere, id: { notIn: [...debts.keys()] } };
    } else {
      totalDebt = sumMoney([...debts.values()].map((debt) => debt.outstandingDebt), BASE_CURRENCY);
    }

    const [rows, totalCount] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        // `id` ikkilamchi tartib — bir xil ismli mijozlarda sahifa
        // chegarasi beqaror bo'lib, yozuv ikki marta chiqmasin
        orderBy: [{ [column]: direction }, { id: direction }],
        ...toPrismaCursor(query.cursor, limit),
      }),
      this.prisma.customer.count({ where }),
    ]);

    const summaries = rows.map((row) => ({
      ...toSummaryDto(row),
      ...(debts.get(row.id) ?? { outstandingDebt: '0.00', debtStatus: CustomerDebtStatus.NONE }),
    }));

    return {
      ...toPage(
        summaries,
        limit,
        (dto) => (column === 'fullName' ? dto.fullName : dto.createdAt),
        totalCount,
      ),
      totalDebt,
    };
  }

  async requireById(id: string, actor: RequestUser): Promise<CustomerDto> {
    const row = await this.prisma.customer.findUnique({ where: { id } });
    if (!row) throw AppException.notFound(ErrorCode.NOT_FOUND, 'Mijoz topilmadi.');

    const debt = await this.debtOf(id);
    return { ...toDto(row, canSeePassport(actor)), ...debt };
  }

  /**
   * §9.8, §6 kengaytma — mijozning joriy qarzi va holati.
   *
   * `Installments` jadvalidan **to'g'ridan-to'g'ri Prisma bilan**
   * o'qiladi — yozish emas, `Reports`/`Dashboard` modullarida ham xuddi
   * shu naqsh (`ARCHITECTURE.md` §5: faqat boshqa modul jadvaliga
   * **yozish** taqiqlangan). Hisob **saqlanmaydi**: har so'rovda faol
   * shartnomalarning to'lov jadvalidan qayta yig'iladi.
   */
  private async debtOf(
    customerId: string,
  ): Promise<Pick<CustomerDto, 'outstandingDebt' | 'debtStatus'>> {
    const contracts = await this.prisma.installmentContract.findMany({
      where: { status: ContractStatus.ACTIVE, sale: { customerId } },
      select: DEBT_CONTRACT_SELECT,
    });

    if (contracts.length === 0) {
      return { outstandingDebt: '0.00', debtStatus: CustomerDebtStatus.NONE };
    }

    const { today, soonBoundary, storeRate } = await this.debtContext();
    return computeDebt(contracts, today, soonBoundary, storeRate);
  }

  /**
   * §6.12, §9.8 kengaytma — ro'yxat uchun qarzni **bitta so'rovda**
   * mijoz bo'yicha guruhlab hisoblaydi (N+1 emas).
   *
   * `sale: { customer: customerWhere }` — qarz joriy filtrga mos
   * mijozlar doirasida hisoblanadi, ya'ni "jami qarz" ham `hasDebt`
   * to'plami ham xuddi shu filtrlangan holatga tegishli bo'ladi.
   * Qarzi yo'q (yoki 0 gacha to'langan) mijozlar xaritada umuman
   * qatnashmaydi — chaqiruvchi tomonda yo'qlik `NONE`/`0.00` degani.
   */
  private async debtsByCustomer(
    customerWhere: Prisma.CustomerWhereInput,
  ): Promise<Map<string, Pick<CustomerDto, 'outstandingDebt' | 'debtStatus'>>> {
    const contracts = await this.prisma.installmentContract.findMany({
      where: { status: ContractStatus.ACTIVE, sale: { customer: customerWhere } },
      select: { ...DEBT_CONTRACT_SELECT, sale: { select: { customerId: true } } },
    });

    const grouped = new Map<string, typeof contracts>();
    for (const contract of contracts) {
      const customerId = contract.sale.customerId;
      if (!customerId) continue;
      const group = grouped.get(customerId);
      if (group) group.push(contract);
      else grouped.set(customerId, [contract]);
    }

    const result = new Map<string, Pick<CustomerDto, 'outstandingDebt' | 'debtStatus'>>();
    if (grouped.size === 0) return result;

    const { today, soonBoundary, storeRate } = await this.debtContext();
    for (const [customerId, group] of grouped) {
      const debt = computeDebt(group, today, soonBoundary, storeRate);
      if (Number(debt.outstandingDebt) > 0) result.set(customerId, debt);
    }
    return result;
  }

  /** Qarz hisobi uchun bugungi kun va kurs — bir marta olinadi. */
  private async debtContext(): Promise<{
    today: string;
    soonBoundary: string;
    storeRate: Prisma.Decimal | null;
  }> {
    const today = businessDay(new Date(), this.timeZone);
    const soonBoundary = toCalendarDate(
      new Date(new Date(`${today}T00:00:00.000Z`).getTime() + DUE_SOON_DAYS * 86_400_000),
    );
    const rate = await this.rates.getForDate(today);
    return { today, soonBoundary, storeRate: rate?.storeRate ?? null };
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
    // §19.2 — rasm ixtiyoriy; tranzaksiyasiz tekshiriladi, chunki
    // `create()` o'zi tranzaksiyasiz (unique buzilishi pastda ushlanadi).
    if (input.passportFileId) {
      await requireFileRef(
        this.prisma,
        input.passportFileId,
        FileKind.PASSPORT,
        'Pasport fayli topilmadi.',
      );
    }

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

    // Yangi mijozda nasiya shartnomasi bo'lishi mumkin emas — qarz har doim yo'q
    return { ...toDto(created, canSeePassport(actor)), outstandingDebt: '0.00', debtStatus: CustomerDebtStatus.NONE };
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
      const dto = await this.updateInTransaction(id, input, precondition, actor, ip);
      const debt = await this.debtOf(id);
      return { ...dto, ...debt };
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
  ): Promise<Omit<CustomerDto, 'outstandingDebt' | 'debtStatus'>> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.customer.findUnique({ where: { id } });
      if (!before) throw AppException.notFound(ErrorCode.NOT_FOUND, 'Mijoz topilmadi.');

      // §19.2 — passportSeries/pinfl bilan bir xil qoida: ko'ra olmaydigan
      // rol yoza olmaydi, `toUpdateData` bu maydonni jimgina tashlab
      // ketadi — shuning uchun tekshiruv ham shu shart bilan
      if (canSeePassport(actor) && input.passportFileId) {
        await requireFileRef(
          tx,
          input.passportFileId,
          FileKind.PASSPORT,
          'Pasport fayli topilmadi.',
        );
      }

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

/** `debtOf()`/`debtsByCustomer()` uchun umumiy tanlov — ikkalasida ham bir xil. */
const DEBT_CONTRACT_SELECT = {
  currency: true,
  schedules: {
    select: { dueDate: true, amountDue: true, amountPaid: true, status: true },
    orderBy: { sequence: 'asc' },
  },
} satisfies Prisma.InstallmentContractSelect;

type DebtContractRow = Prisma.InstallmentContractGetPayload<{ select: typeof DEBT_CONTRACT_SELECT }>;

/**
 * §9.8, §6 kengaytma — bitta mijoz(lar) guruhi uchun qarz va holat.
 *
 * `debtOf()` va `debtsByCustomer()` bir xil mantiqni ishlatadi — bu
 * yerda ajratilgan, aks holda ikkovi asta-sekin bir-biridan chetga
 * chiqib ketardi (chegara qiymatlari, valyuta aylantirish va h.k.).
 */
function computeDebt(
  contracts: readonly DebtContractRow[],
  today: string,
  soonBoundary: string,
  storeRate: Prisma.Decimal | null,
): Pick<CustomerDto, 'outstandingDebt' | 'debtStatus'> {
  const parts: string[] = [];
  let hasOverdue = false;
  let hasDueSoon = false;

  for (const contract of contracts) {
    const outstanding = outstandingOfRows(contract.schedules);
    if (Number(outstanding) <= 0) continue;

    parts.push(
      contract.currency === BASE_CURRENCY
        ? outstanding
        : storeRate
          ? convert(new Prisma.Decimal(outstanding), contract.currency, BASE_CURRENCY, storeRate)
          : '0',
    );

    const unpaid = contract.schedules.filter((row) => row.status !== ScheduleStatus.PAID);
    for (const row of unpaid) {
      const due = toCalendarDate(row.dueDate);
      if (due < today) hasOverdue = true;
      else if (due <= soonBoundary) hasDueSoon = true;
    }
  }

  const outstandingDebt = sumMoney(parts, BASE_CURRENCY);
  if (Number(outstandingDebt) <= 0) {
    return { outstandingDebt, debtStatus: CustomerDebtStatus.NONE };
  }

  const debtStatus = hasOverdue
    ? CustomerDebtStatus.OVERDUE
    : hasDueSoon
      ? CustomerDebtStatus.DUE_SOON
      : CustomerDebtStatus.ON_SCHEDULE;

  return { outstandingDebt, debtStatus };
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
    passportFileId: input.passportFileId ?? undefined,
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
    if (input.passportFileId !== undefined) data.passportFileId = input.passportFileId;
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
    hasPassport: Boolean(
      row.passportSeries ?? row.passportNumber ?? row.pinfl ?? row.passportFileId,
    ),
    isFlagged: row.isFlagged,
    flagReason: row.flagReason,
    isActive: row.isActive,
  };
}

/** Qarz maydonlarisiz — chaqiruvchi `debtOf()`/`debtsByCustomer()` natijasini qo'shadi. */
function toSummaryDto(row: Customer): Omit<CustomerSummaryDto, 'outstandingDebt' | 'debtStatus'> {
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

/** Qarz maydonlarisiz — chaqiruvchi `debtOf()` natijasini qo'shadi. */
function toDto(
  row: Customer,
  withPassport: boolean,
): Omit<CustomerDto, 'outstandingDebt' | 'debtStatus'> {
  return {
    ...toSummaryDto(row),
    address: row.address,
    note: row.note,
    passportSeries: withPassport ? row.passportSeries : null,
    passportNumber: withPassport ? row.passportNumber : null,
    pinfl: withPassport ? row.pinfl : null,
    passportFileId: withPassport ? row.passportFileId : null,
  };
}
