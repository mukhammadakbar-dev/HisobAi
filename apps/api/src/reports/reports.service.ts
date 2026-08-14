import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CashDirection,
  CashSourceType,
  ContractStatus,
  Currency,
  InventoryStatus,
  ScheduleStatus,
  SaleStatus,
  StockMovementType,
  multiplyMoney,
  sumMoney,
  type AuditLogDto,
  type AuditQuery,
  type DebtorDto,
  type DebtorsReportDto,
  type InventoryValueDto,
  type Page,
  type ProfitBreakdownDto,
  type ReportGranularity,
  type ReportMetricDto,
  type ReportPeriod,
  type ReportSeriesDto,
  type ReportSeriesQuery,
  type ReportSummaryDto,
  type TopProductsDto,
  type TopProductsQuery,
} from '@hisobai/contracts';
import { Prisma } from '@prisma/client';

import {
  businessDay,
  dayRangeFilter,
  dayStartInstant,
  daysBetween,
  fromCalendarDate,
  toCalendarDate,
} from '../common/dates';
import { normalizeLimit, toPage, toPrismaCursor } from '../common/pagination';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { outstandingOfRows } from '../payments/allocation.service';
import { convert } from '../sales/sales.service';

/** §1.1 — barcha hisobot so'mda jamlanadi. */
const BASE_CURRENCY = Currency.UZS;

/**
 * Hisobotga kiradigan savdo qatorlari.
 *
 * `REVERSAL` **ATAYLAB ro'yxatda**: qaytarish ham hisobotda ko'rinishi
 * kerak (§8) va u alohida `sales` qatori (§17.4). Uning `total` i
 * manfiy, ya'ni aylanma o'z-o'zidan sof qiymatga keladi. Foyda esa
 * qatorlardan hisoblangani uchun MUSBAT chiqadi va uni qo'lda
 * teskarilash kerak — `profitOfSale` ga qarang.
 *
 * `DRAFT` va `CANCELLED` yo'q: birinchisi hali savdo emas, ikkinchisi
 * esa "umuman bo'lmagan" deb hisoblanadi (§8, §16.5).
 */
const REPORTED_STATUSES: SaleStatus[] = [
  SaleStatus.CONFIRMED,
  SaleStatus.PARTIALLY_RETURNED,
  SaleStatus.RETURNED,
  SaleStatus.REVERSAL,
];

type SaleRow = {
  status: SaleStatus;
  currency: Currency;
  total: Prisma.Decimal;
  exchangeRate: Prisma.Decimal;
  soldAt: Date;
  items: {
    quantity: number;
    unitPrice: Prisma.Decimal;
    costSnapshot: Prisma.Decimal;
    costCurrency: Currency;
  }[];
};

/**
 * Davr hisobotlari (§13).
 *
 * **Hech narsa saqlanmaydi** (§13.10): har so'rov qaytadan hisoblanadi.
 * Saqlangan hisobot savdo qaytarilganda jimgina eskirardi va uni
 * yangilaydigan jarayon kerak bo'lardi — u ishlamay qolgan kuni
 * hisobot yolg'on ko'rsatardi.
 *
 * Aylantirish **savdo paytidagi snapshot kursda** (§5.9, §1.7): bugungi
 * kurs o'zgarganda o'tgan oyning hisoboti o'zgarmasligi kerak. Shuning
 * uchun bu yerda `exchangeRate` har doim savdoning o'ziniki, hech
 * qachon "bugungi kurs" emas.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get timeZone(): string {
    return this.config.get('TIMEZONE', { infer: true });
  }

  /**
   * KPI va oldingi davr bilan solishtiruv (§13.3, §13.5).
   *
   * Oldingi davr — **shu uzunlikdagi, bevosita oldin turgan** oraliq.
   * "O'tgan oyning shu kuni" emas: 31 kunlik oyni 28 kunlik oy bilan
   * solishtirish foizni o'z-o'zidan buzardi.
   */
  async summary(period: ReportPeriod): Promise<ReportSummaryDto> {
    const previous = previousPeriod(period);

    const [current, before] = await Promise.all([
      this.periodFigures(period),
      this.periodFigures(previous),
    ]);

    return {
      from: period.from,
      to: period.to,
      previousFrom: previous.from,
      previousTo: previous.to,
      currency: BASE_CURRENCY,
      revenue: metric(current.revenue, before.revenue),
      saleCount: metric(String(current.saleCount), String(before.saleCount)),
      profit: breakdown(current, before),
    };
  }

  /**
   * §13.6 — savdo va foyda dinamikasi.
   *
   * Qadam foydalanuvchidan keladi (`granularity`), server "aqlli"
   * tanlamaydi: bir oylik davrni kunlik ham, haftalik ham ko'rish
   * to'g'ri va tanlovni yashirish grafikni kutilmaganda o'zgartirib
   * turardi.
   *
   * Guruhlash **do'kon vaqt zonasida** (§1.3): UTC bo'yicha bo'linsa,
   * kechqurungi savdo ertangi kunga tushib qolardi.
   */
  async series(query: ReportSeriesQuery): Promise<ReportSeriesDto> {
    const { gte, lt } = this.rangeOf(query);
    const sales = await this.salesIn(gte, lt);

    const buckets = new Map<string, { revenue: string[]; profit: string[]; count: number }>();
    for (const bucket of bucketStarts(query)) {
      buckets.set(bucket, { revenue: [], profit: [], count: 0 });
    }

    for (const sale of sales) {
      const day = businessDay(sale.soldAt, this.timeZone);
      const key = bucketOf(day, query.granularity);
      const bucket = buckets.get(key);
      // Chegaraga tushmagan savdo bo'lmasligi kerak, lekin u jimgina
      // yo'qolib ketmasin: `??` bilan yaratamiz
      const target = bucket ?? { revenue: [], profit: [], count: 0 };
      target.revenue.push(convert(sale.total, sale.currency, BASE_CURRENCY, sale.exchangeRate));
      target.profit.push(profitOfSale(sale));
      if (sale.status !== SaleStatus.REVERSAL) target.count += 1;
      buckets.set(key, target);
    }

    return {
      from: query.from,
      to: query.to,
      granularity: query.granularity,
      currency: BASE_CURRENCY,
      points: [...buckets.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, bucket]) => ({
          date,
          revenue: sumMoney(bucket.revenue, BASE_CURRENCY),
          profit: sumMoney(bucket.profit, BASE_CURRENCY),
          saleCount: bucket.count,
        })),
    };
  }

  /**
   * §13.7 — qaysi model qancha sotildi va qancha foyda keltirdi.
   *
   * Qaytarish bu yerda ham ayriladi: teskari yozuvning qatorlari o'sha
   * mahsulotga tegishli va ularning miqdori ham, foydasi ham manfiy
   * ishora bilan qo'shiladi. Aks holda qaytarilgan telefon "eng ko'p
   * sotilgan" ro'yxatining tepasida turib qolardi.
   */
  async topProducts(query: TopProductsQuery): Promise<TopProductsDto> {
    const { gte, lt } = this.rangeOf(query);

    const items = await this.prisma.saleItem.findMany({
      where: { sale: { status: { in: REPORTED_STATUSES }, soldAt: { gte, lt } } },
      select: {
        quantity: true,
        unitPrice: true,
        costSnapshot: true,
        costCurrency: true,
        productId: true,
        product: { select: { displayName: true } },
        sale: { select: { status: true, currency: true, exchangeRate: true } },
      },
    });

    const totals = new Map<
      string,
      { name: string; quantity: number; revenue: string[]; profit: string[] }
    >();

    for (const item of items) {
      const sign = item.sale.status === SaleStatus.REVERSAL ? -1 : 1;
      const currency = item.sale.currency;

      const lineRevenue = multiplyMoney(item.unitPrice.toString(), item.quantity, currency);
      const lineCost = multiplyMoney(
        convert(item.costSnapshot, item.costCurrency, currency, item.sale.exchangeRate),
        item.quantity,
        currency,
      );
      const lineProfit = sumMoney([lineRevenue, `-${lineCost}`], currency);

      const entry = totals.get(item.productId) ?? {
        name: item.product.displayName,
        quantity: 0,
        revenue: [],
        profit: [],
      };
      entry.quantity += sign * item.quantity;
      entry.revenue.push(
        signed(
          convert(new Prisma.Decimal(lineRevenue), currency, BASE_CURRENCY, item.sale.exchangeRate),
          sign,
        ),
      );
      entry.profit.push(
        signed(
          convert(new Prisma.Decimal(lineProfit), currency, BASE_CURRENCY, item.sale.exchangeRate),
          sign,
        ),
      );
      totals.set(item.productId, entry);
    }

    const products = [...totals.entries()]
      .map(([productId, entry]) => ({
        productId,
        productName: entry.name,
        quantity: entry.quantity,
        revenue: sumMoney(entry.revenue, BASE_CURRENCY),
        profit: sumMoney(entry.profit, BASE_CURRENCY),
      }))
      // Tartib FOYDA bo'yicha, aylanma bo'yicha emas: §13.7 savolining
      // o'zi "qancha foyda keltirdi" degan savol
      .sort((left, right) => Number(right.profit) - Number(left.profit))
      .slice(0, query.limit);

    return { from: query.from, to: query.to, currency: BASE_CURRENCY, products };
  }

  /**
   * §5.9 — ombor qiymati **bugungi do'kon kursida**.
   *
   * Foyda hisobidan ATAYLAB farq qiladi: u savdo paytidagi snapshot
   * kursda qoladi (o'tgan davr hisoboti o'zgarmasin), ombor esa hali
   * sotilmagan mol — uning BUGUNGI qiymati so'raladi.
   *
   * `RETURNED` birliklar ham hisobga kiradi: ular omborda turibdi va
   * qayta sotiladi (§16.4). `SOLD` va `WRITTEN_OFF` kirmaydi.
   */
  async inventoryValue(): Promise<InventoryValueDto> {
    const [items, batches, rate] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: { status: { in: [InventoryStatus.AVAILABLE, InventoryStatus.RETURNED] } },
        select: { costPrice: true, costCurrency: true },
      }),
      this.prisma.inventoryBatch.findMany({
        where: { quantityRemaining: { gt: 0 } },
        select: { quantityRemaining: true, unitCost: true, costCurrency: true },
      }),
      this.latestStoreRate(),
    ]);

    const parts: string[] = [];
    let rateMissing = false;

    for (const item of items) {
      if (item.costCurrency !== BASE_CURRENCY && !rate) {
        rateMissing = true;
        continue;
      }
      parts.push(
        item.costCurrency === BASE_CURRENCY
          ? item.costPrice.toString()
          : convert(item.costPrice, item.costCurrency, BASE_CURRENCY, rate as Prisma.Decimal),
      );
    }

    for (const batch of batches) {
      if (batch.costCurrency !== BASE_CURRENCY && !rate) {
        rateMissing = true;
        continue;
      }
      const perUnit =
        batch.costCurrency === BASE_CURRENCY
          ? batch.unitCost.toString()
          : convert(batch.unitCost, batch.costCurrency, BASE_CURRENCY, rate as Prisma.Decimal);
      parts.push(multiplyMoney(perUnit, batch.quantityRemaining, BASE_CURRENCY));
    }

    return {
      currency: BASE_CURRENCY,
      totalCost: sumMoney(parts, BASE_CURRENCY),
      serializedCount: items.length,
      batchQuantity: batches.reduce((sum, batch) => sum + batch.quantityRemaining, 0),
      // Kurs yo'qligi JIMGINA nolga aylanmaydi: ekran buni aytadi,
      // aks holda ombor qiymati sababsiz kamayib ko'rinardi
      rateMissing,
    };
  }

  /**
   * §13.8 — qarzdorlar. **Muddati o'tganlar tepada.**
   *
   * Tartib ataylab shunday: ro'yxatning maqsadi "kimga qo'ng'iroq
   * qilish kerak" degan savolga javob berish. Alifbo yoki summa
   * bo'yicha saralash o'sha savolni yashirardi — eng ko'p kechikkan
   * mijoz ro'yxat o'rtasida qolib ketardi.
   *
   * `daysOverdue` serverda hisoblanadi (§9.8): "bugun" do'kon vaqt
   * zonasida aniqlanadi (§1.3) va brauzer zonasi undan farq qilishi
   * mumkin — mijozga "3 kun kechikdingiz" deb aytishdan oldin bu aniq
   * bo'lishi kerak.
   */
  async debtors(): Promise<DebtorsReportDto> {
    const contracts = await this.prisma.installmentContract.findMany({
      where: { status: ContractStatus.ACTIVE },
      select: {
        id: true,
        currency: true,
        sale: {
          select: {
            number: true,
            customerId: true,
            customer: { select: { fullName: true } },
            exchangeRate: true,
          },
        },
        schedules: {
          select: { dueDate: true, amountDue: true, amountPaid: true, status: true },
          orderBy: { sequence: 'asc' },
        },
      },
    });

    const today = businessDay(new Date(), this.timeZone);
    const debtors: DebtorDto[] = [];

    for (const contract of contracts) {
      const outstanding = outstandingOfRows(contract.schedules);
      // Qarzi qolmagan shartnoma qarzdorlar ro'yxatida turishi mumkin
      // emas: §16.11 bo'yicha u yopilgan bo'lishi kerak edi, lekin
      // ro'yxat unga tayanmaydi — hisob har doim jadvaldan
      if (Number(outstanding) <= 0) continue;

      const unpaid = contract.schedules.filter((row) => row.status !== ScheduleStatus.PAID);
      const nextDue = unpaid[0] ? toCalendarDate(unpaid[0].dueDate) : null;

      debtors.push({
        contractId: contract.id,
        customerId: contract.sale.customerId,
        customerName: contract.sale.customer?.fullName ?? null,
        saleNumber: contract.sale.number,
        currency: contract.currency,
        outstanding,
        nextDueDate: nextDue,
        daysOverdue: nextDue !== null && nextDue < today ? daysBetween(nextDue, today) : 0,
      });
    }

    debtors.sort(
      (left, right) =>
        // Avval kechikish bo'yicha (ko'pi tepada), keyin summa bo'yicha:
        // bir xil kechikkan ikki mijozdan kattaroq qarzi borini oldin
        // ko'rish mantiqan to'g'ri
        right.daysOverdue - left.daysOverdue ||
        Number(right.outstanding) - Number(left.outstanding),
    );

    const rate = await this.latestStoreRate();

    return {
      currency: BASE_CURRENCY,
      overdueCount: debtors.filter((row) => row.daysOverdue > 0).length,
      totalOutstanding: sumMoney(
        debtors.map((row) =>
          row.currency === BASE_CURRENCY
            ? row.outstanding
            : rate
              ? convert(new Prisma.Decimal(row.outstanding), row.currency, BASE_CURRENCY, rate)
              : '0',
        ),
        BASE_CURRENCY,
      ),
      debtors,
    };
  }

  /**
   * Audit ko'rinishi (§2.2) — **faqat o'qish**.
   *
   * Yozuvni o'zgartirish yoki o'chirish endpointi yo'q va bo'lmaydi:
   * `hisobai_app` roli uchun `audit_logs` da `UPDATE`/`DELETE`
   * bazaning o'zida bekor qilingan (§12, §21.16). Ya'ni bu yerda
   * "o'chirish" yozilsa ham u ishlamasdi — chegara ikki qatlamda.
   */
  async auditLogs(query: AuditQuery): Promise<Page<AuditLogDto>> {
    const limit = normalizeLimit(query.limit);
    const createdAt = dayRangeFilter(query.from, query.to, this.timeZone);

    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: query.action,
        entityType: query.entityType,
        entityId: query.entityId,
        actorId: query.actorId,
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...toPrismaCursor(query.cursor, limit),
    });

    // Aktyor nomi alohida so'rov bilan: `actor_id` da FK YO'Q (§21.3 —
    // ustunga ikki xil aktyor yoziladi, business `User` va
    // `PlatformAdmin`), ya'ni Prisma `include` ni tuzib bera olmaydi
    const actorIds = [...new Set(rows.map((row) => row.actorId).filter(isPresent))];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, displayName: true },
    });
    const names = new Map(actors.map((actor) => [actor.id, actor.displayName]));

    return toPage(
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        actorId: row.actorId,
        actorName: row.actorId ? (names.get(row.actorId) ?? null) : null,
        before: row.beforeJson,
        after: row.afterJson,
        ip: row.ip,
        createdAt: row.createdAt.toISOString(),
      })),
      limit,
      (dto) => dto.createdAt,
    );
  }

  // ──────────────────────────── Hisob-kitob ────────────────────────────

  /** Bitta davrning barcha raqamlari — solishtiruv uchun ikki marta chaqiriladi. */
  private async periodFigures(period: ReportPeriod): Promise<Figures> {
    const { gte, lt } = this.rangeOf(period);

    const [sales, markup, cashOut, nonCash] = await Promise.all([
      this.salesIn(gte, lt),
      this.markupIncome(gte, lt),
      this.cashExpenses(gte, lt),
      this.nonCashExpenses(gte, lt),
    ]);

    const revenue = sumMoney(
      sales.map((sale) => convert(sale.total, sale.currency, BASE_CURRENCY, sale.exchangeRate)),
      BASE_CURRENCY,
    );
    const grossProfit = sumMoney(sales.map(profitOfSale), BASE_CURRENCY);

    const netProfit = sumMoney([grossProfit, markup, `-${cashOut}`, `-${nonCash}`], BASE_CURRENCY);

    return {
      // Teskari yozuvlar savdo SONIGA kirmaydi: ular yangi savdo emas,
      // ya'ni "nechta savdo bo'ldi" degan savolga javob bermaydi
      saleCount: sales.filter((sale) => sale.status !== SaleStatus.REVERSAL).length,
      revenue,
      grossProfit,
      markupIncome: markup,
      cashExpenses: cashOut,
      nonCashExpenses: nonCash,
      netProfit,
    };
  }

  private async salesIn(gte: Date, lt: Date): Promise<SaleRow[]> {
    return this.prisma.sale.findMany({
      where: { status: { in: REPORTED_STATUSES }, soldAt: { gte, lt } },
      select: {
        status: true,
        currency: true,
        total: true,
        exchangeRate: true,
        soldAt: true,
        items: {
          select: { quantity: true, unitPrice: true, costSnapshot: true, costCurrency: true },
        },
      },
    });
  }

  /**
   * §9.4, §17.3 — nasiya ustamasi **alohida daromad satri** va u savdo
   * kunida to'liq tan olinadi (§13.1).
   *
   * Shartnomaning `createdAt` i emas, **savdoning sanasi** bo'yicha:
   * shartnoma savdo bilan bitta tranzaksiyada tug'iladi (§9.1), lekin
   * orqaga qo'yilgan savdoda (§7.5) ular bir kunga tushmaydi.
   */
  private async markupIncome(gte: Date, lt: Date): Promise<string> {
    const contracts = await this.prisma.installmentContract.findMany({
      where: { sale: { soldAt: { gte, lt }, status: { in: REPORTED_STATUSES } } },
      select: {
        markupAmount: true,
        currency: true,
        sale: { select: { exchangeRate: true } },
      },
    });

    return sumMoney(
      contracts.map((contract) =>
        convert(
          contract.markupAmount,
          contract.currency,
          BASE_CURRENCY,
          contract.sale.exchangeRate,
        ),
      ),
      BASE_CURRENCY,
    );
  }

  /**
   * §11 — kassadan chiqqan pul.
   *
   * `OPENING_BALANCE` va `EXCHANGE` **chiqarib tashlanadi** (§11.4,
   * §11.6): birinchisi umuman harakat emas, ikkinchisi esa pulni bir
   * hisobdan ikkinchisiga ko'chiradi — ikkalasini xarajat deb sanash
   * sof foydani yo'qdan kamaytirardi.
   *
   * `REVERSAL` ham chiqarilgan: qaytarilgan savdoning puli aylanmadan
   * allaqachon ayrilgan (teskari `sales` qatori orqali), uni yana
   * xarajat deb sanash bir summani ikki marta hisoblash bo'lardi.
   */
  private async cashExpenses(gte: Date, lt: Date): Promise<string> {
    const entries = await this.prisma.cashEntry.findMany({
      where: {
        direction: CashDirection.OUT,
        occurredAt: { gte, lt },
        sourceType: {
          notIn: [CashSourceType.OPENING_BALANCE, CashSourceType.EXCHANGE, CashSourceType.REVERSAL],
        },
      },
      select: { amount: true, currency: true },
    });

    // Kassa yozuvi hisob valyutasida; bazaviy valyutaga o'sha kunning
    // kursi bilan emas, savdo kursi bilan ham emas — bu yerda faqat
    // so'mdagi yozuvlar aniq, valyutalisi uchun kurs kerak. §11.1
    // bo'yicha yozuv valyutasi hisob valyutasiga teng.
    const rate = await this.latestStoreRate();

    return sumMoney(
      entries.map((entry) =>
        entry.currency === BASE_CURRENCY
          ? entry.amount.toString()
          : rate
            ? convert(entry.amount, entry.currency, BASE_CURRENCY, rate)
            : '0',
      ),
      BASE_CURRENCY,
    );
  }

  /**
   * §17.12 — **pul bo'lmagan xarajatlar**: shaxsiy foydalanish va ombor
   * yo'qotishlari, tannarx bo'yicha.
   *
   * Ular kassadan pul olib chiqmaydi (§17.12 aynan shu sababdan
   * `PERSONAL_USE` ni `CashSourceType` dan olib tashlagan), lekin
   * foydani kamaytiradi: mol do'kondan chiqib ketgan.
   */
  private async nonCashExpenses(gte: Date, lt: Date): Promise<string> {
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        type: { in: [StockMovementType.PERSONAL_USE, StockMovementType.ADJUST] },
        occurredAt: { gte, lt },
      },
      select: {
        quantity: true,
        type: true,
        inventoryItem: { select: { costPrice: true, costCurrency: true } },
        batch: { select: { unitCost: true, costCurrency: true } },
      },
    });

    const rate = await this.latestStoreRate();
    const parts: string[] = [];

    for (const movement of movements) {
      const cost = movement.inventoryItem
        ? {
            amount: movement.inventoryItem.costPrice,
            currency: movement.inventoryItem.costCurrency,
          }
        : movement.batch
          ? { amount: movement.batch.unitCost, currency: movement.batch.costCurrency }
          : null;
      if (!cost) continue;

      const perUnit =
        cost.currency === BASE_CURRENCY
          ? cost.amount.toString()
          : rate
            ? convert(cost.amount, cost.currency, BASE_CURRENCY, rate)
            : '0';

      parts.push(multiplyMoney(perUnit, movement.quantity, BASE_CURRENCY));
    }

    return sumMoney(parts, BASE_CURRENCY);
  }

  /**
   * Valyutali yozuvlarni baholash uchun oxirgi do'kon kursi.
   *
   * Savdo va foyda uchun bu ISHLATILMAYDI — u yerda snapshot kurs bor
   * (§5.9). Kurs faqat snapshot'i yo'q narsalarga kerak: kassa
   * xarajatlari va ombor tannarxi.
   */
  private async latestStoreRate(): Promise<Prisma.Decimal | null> {
    const rate = await this.prisma.shopExchangeRate.findFirst({
      orderBy: { date: 'desc' },
      select: { storeRate: true },
    });
    return rate?.storeRate ?? null;
  }

  /** Kalendar davrni do'kon zonasidagi yarim ochiq oraliqqa aylantiradi. */
  private rangeOf(period: ReportPeriod): { gte: Date; lt: Date } {
    return {
      gte: dayStartInstant(period.from, this.timeZone),
      // `to` inklyuziv (sxema izohiga qarang) — ertangi kun boshigacha
      lt: dayStartInstant(addDays(period.to, 1), this.timeZone),
    };
  }
}

interface Figures {
  saleCount: number;
  revenue: string;
  grossProfit: string;
  markupIncome: string;
  cashExpenses: string;
  nonCashExpenses: string;
  netProfit: string;
}

/**
 * Bitta savdoning yalpi foydasi, bazaviy valyutada.
 *
 * Teskari yozuvda natija **teskarilanadi**: uning qatorlari musbat
 * miqdor va musbat narx bilan yozilgan (§22.2 — ishorani `sales.total`
 * olib yuradi), ya'ni hisob musbat foyda berardi. Aslida qaytarish
 * foydani KAMAYTIRADI.
 */
function profitOfSale(sale: SaleRow): string {
  const parts: string[] = [];

  for (const item of sale.items) {
    const lineRevenue = multiplyMoney(item.unitPrice.toString(), item.quantity, sale.currency);
    const lineCost = multiplyMoney(
      convert(item.costSnapshot, item.costCurrency, sale.currency, sale.exchangeRate),
      item.quantity,
      sale.currency,
    );
    parts.push(lineRevenue, `-${lineCost}`);
  }

  const inSaleCurrency = sumMoney(parts, sale.currency);
  const inBase = convert(
    new Prisma.Decimal(inSaleCurrency),
    sale.currency,
    BASE_CURRENCY,
    sale.exchangeRate,
  );

  return sale.status === SaleStatus.REVERSAL ? negate(inBase) : inBase;
}

function negate(amount: string): string {
  return amount.startsWith('-') ? amount.slice(1) : `-${amount}`;
}

/**
 * §13.5 — foiz o'zgarishi.
 *
 * Oldingi qiymat nol bo'lsa natija **`null`**: nolga bo'lish
 * aniqlanmagan va uni `100%` deb ko'rsatish yolg'on bo'lardi (noldan
 * o'sish har doim "cheksiz"). Ekran bunday holatda "—" chizadi.
 */
function metric(value: string, previous: string): ReportMetricDto {
  const current = Number(value);
  const before = Number(previous);

  return {
    value,
    previous,
    changePercent: before === 0 ? null : Math.round(((current - before) / Math.abs(before)) * 100),
  };
}

function breakdown(current: Figures, before: Figures): ProfitBreakdownDto {
  return {
    grossProfit: metric(current.grossProfit, before.grossProfit),
    markupIncome: metric(current.markupIncome, before.markupIncome),
    cashExpenses: metric(current.cashExpenses, before.cashExpenses),
    nonCashExpenses: metric(current.nonCashExpenses, before.nonCashExpenses),
    netProfit: metric(current.netProfit, before.netProfit),
  };
}

/**
 * Oldingi davr — shu uzunlikdagi, bevosita oldin turgan oraliq.
 *
 * Uzunlik kunlarda o'lchanadi va `to` inklyuziv bo'lgani uchun bitta
 * qo'shiladi: 1–31 avgust = 31 kun, oldingisi 1–31 iyul emas, balki
 * 1 iyul – 31 iyul (aynan 31 kun oldin).
 */
function previousPeriod(period: ReportPeriod): ReportPeriod {
  const length = daysBetween(period.from, period.to) + 1;
  return {
    from: addDays(period.from, -length),
    to: addDays(period.to, -length),
  };
}

function addDays(date: string, days: number): string {
  const shifted = new Date(fromCalendarDate(date).getTime() + days * 86_400_000);
  return toCalendarDate(shifted);
}

/** Ishorani qo'llaydi — teskari yozuv qatorlari uchun. */
function signed(amount: string, sign: number): string {
  return sign < 0 ? negate(amount) : amount;
}

/**
 * Sana qaysi qadamga tushishi (§13.6).
 *
 * Hafta **dushanbadan** boshlanadi: O'zbekistonda ish haftasi shu
 * kundan boshlanadi va "haftalik savdo" degani aynan shu oraliq.
 */
function bucketOf(day: string, granularity: ReportGranularity): string {
  if (granularity === 'day') return day;
  if (granularity === 'month') return `${day.slice(0, 7)}-01`;

  const date = fromCalendarDate(day);
  // `getUTCDay()`: 0 — yakshanba, 1 — dushanba
  const weekday = (date.getUTCDay() + 6) % 7;
  return toCalendarDate(new Date(date.getTime() - weekday * 86_400_000));
}

/**
 * Davrdagi barcha qadamlar — **savdosiz kunlar ham**.
 *
 * Ularsiz grafik uzuq bo'lardi: savdo bo'lmagan kun chizmadan tushib
 * qolib, ikki kun yonma-yon turgandek ko'rinardi va pasayish umuman
 * ko'rinmasdi.
 */
function bucketStarts(query: ReportSeriesQuery): string[] {
  const seen = new Set<string>();
  let cursor = query.from;

  while (cursor <= query.to) {
    seen.add(bucketOf(cursor, query.granularity));
    cursor = addDays(cursor, 1);
  }
  return [...seen];
}

/** `filter(Boolean)` tipni toraytirmaydi — bu esa toraytiradi. */
function isPresent(value: string | null): value is string {
  return value !== null;
}
