import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CashDirection,
  CashSourceType,
  Currency,
  SaleStatus,
  StockMovementType,
  multiplyMoney,
  sumMoney,
  type ProfitBreakdownDto,
  type ReportMetricDto,
  type ReportPeriod,
  type ReportSummaryDto,
} from '@hisobai/contracts';
import { Prisma } from '@prisma/client';

import { dayStartInstant, daysBetween, fromCalendarDate, toCalendarDate } from '../common/dates';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
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
