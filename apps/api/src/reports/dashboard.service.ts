import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BASE_CURRENCY,
  ContractStatus,
  Currency,
  InventoryStatus,
  SaleStatus,
  ScheduleStatus,
  UserRole,
  multiplyMoney,
  roundMoney,
  sumMoney,
  type DashboardActivityDto,
  type DashboardChartPointDto,
  type DashboardDto,
  type DashboardDuePaymentDto,
  type DashboardLowStockDto,
  type DashboardOverdueCustomerDto,
  type DashboardOverdueDto,
} from '@hisobai/contracts';
import { Prisma } from '@prisma/client';

import { CashAccountsService } from '../cash/cash-accounts.service';
import {
  businessDay,
  daysBetween,
  dayStartInstant,
  fromCalendarDate,
  toCalendarDate,
  today,
} from '../common/dates';
import type { RequestUser } from '../common/request-user';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { outstandingOfRows } from '../payments/allocation.service';
import { convert } from '../sales/sales.service';
import { ShopsService } from '../shops/shops.service';

/** §14.4 — grafik shuncha kunni ko'rsatadi. */
const CHART_DAYS = 14;
/** So'nggi amallar ro'yxati uzunligi. */
const ACTIVITY_LIMIT = 8;
/** "Kam qolgan" ro'yxatida ko'rsatiladigan mahsulotlar soni. */
const LOW_STOCK_LIMIT = 5;
/**
 * §14.4 — muddati o'tgan qarzdorlar bloki "eng katta bir nechtasi" ni
 * ko'rsatadi (`dashboard.ts` DTO izohi): to'liq ro'yxat allaqachon
 * `/reports/debts` da bor (`ReportsService.debtors()`), bu yerda faqat
 * ega birinchi ekranda "kimga birinchi qo'ng'iroq qilish kerak" degan
 * savolga javob beradigan qisqa ro'yxat kerak — LOW_STOCK_LIMIT bilan
 * bir xil uzunlik tanlangan (kichik ekranda mos keladi).
 */
const OVERDUE_TOP_LIMIT = 5;

/**
 * Dashboard (§14) — **bitta so'rov** (§14.1).
 *
 * Telefon internetida har blok uchun alohida so'rov yuborish sahifani
 * sezilarli sekinlashtiradi, shuning uchun hamma narsa shu servisda
 * yig'iladi. Bloklar bir-biriga bog'liq emas: birida ma'lumot
 * bo'lmasa (masalan nasiya moduli hali yo'q), qolgani baribir keladi
 * (`FRONTEND.md` §7 — qisman xato).
 *
 * **Faqat bugungi kun** (§14.2) — bitta istisno grafik: u §14.4
 * talab qilgan dinamikani ko'rsatadi va kengroq davr uchun
 * `/reports` ga o'tiladi.
 *
 * Nasiya bloklari (`duePayments`, `overdue`, §14.3–§14.4) — `credit()`
 * ga qarang. `ReportsService.debtors()` mantig'i shu yerda ATAYLAB
 * takrorlanadi, to'g'ridan-to'g'ri chaqirilmaydi: u SHARTNOMA
 * darajasida qaytaradi va `phone` ni olib kelmaydi, dashboard'ga esa
 * MIJOZ darajasidagi agregatsiya va telefon raqami kerak (§14.3).
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: CashAccountsService,
    private readonly rates: ExchangeRatesService,
    private readonly shops: ShopsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get timeZone(): string {
    return this.config.get('TIMEZONE', { infer: true });
  }

  async get(actor: RequestUser): Promise<DashboardDto> {
    const day = today(this.timeZone);
    const dayStart = dayStartInstant(day, this.timeZone);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const showCost = actor.role === UserRole.SHOP_ADMIN;

    // §1.5 — kurs bo'lmasa ham dashboard ochilishi kerak; USD qiymatlar
    // oxirgi ma'lum kurs bilan aylantiriladi
    const rate = await this.rates.getForDate(day);
    const storeRate = rate?.storeRate ?? null;

    const [sales, cashAccounts, inventory, chart, activity, credit] = await Promise.all([
      this.todaySales(dayStart, dayEnd, storeRate, showCost),
      showCost ? this.cash() : Promise.resolve(null),
      this.inventory(storeRate, showCost),
      this.chart(day, storeRate),
      this.activity(),
      this.credit(day, storeRate),
    ]);

    return {
      date: day,
      currency: BASE_CURRENCY,
      sales,
      duePayments: credit.duePayments,
      cashAccounts,
      overdue: credit.overdue,
      inventory,
      recentActivity: activity,
      chart,
    };
  }

  // ──────────────────────────── §14.3 ────────────────────────────

  /**
   * Bugungi savdo va foyda.
   *
   * Savdo o'z valyutasida yozilgan, dashboard esa bazaviy valyutada
   * (§1.1) — aylantirish **savdoning o'z kurs snapshoti** bilan
   * (§1.7), bugungi kurs bilan emas: o'tgan savdo bugun kurs
   * o'zgargani uchun boshqa raqam ko'rsatmasligi kerak.
   */
  private async todaySales(
    from: Date,
    to: Date,
    _storeRate: Prisma.Decimal | null,
    showCost: boolean,
  ): Promise<DashboardDto['sales']> {
    const sales = await this.prisma.sale.findMany({
      where: { status: { in: CONFIRMED_STATUSES }, soldAt: { gte: from, lt: to } },
      select: {
        currency: true,
        total: true,
        exchangeRate: true,
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            costSnapshot: true,
            costCurrency: true,
          },
        },
      },
    });

    const revenue = sumMoney(
      sales.map((sale) => convert(sale.total, sale.currency, BASE_CURRENCY, sale.exchangeRate)),
      BASE_CURRENCY,
    );

    if (!showCost) {
      return { count: sales.length, revenue, profit: null };
    }

    const profits = sales.map((sale) => {
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
      return convert(
        new Prisma.Decimal(inSaleCurrency),
        sale.currency,
        BASE_CURRENCY,
        sale.exchangeRate,
      );
    });

    return { count: sales.length, revenue, profit: sumMoney(profits, BASE_CURRENCY) };
  }

  /** §14.3 — kassadagi pul; `SELLER` uchun bu blok umuman chaqirilmaydi. */
  private async cash(): Promise<DashboardDto['cashAccounts']> {
    const balances = await this.accounts.listBalances(false);
    return balances.map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
      balance: account.balance,
    }));
  }

  /**
   * Nasiya bloklari — §14.3 "bugun/ertaga to'lovi keladiganlar" va
   * §14.4 "muddati o'tgan qarzlar" — **bitta so'rovdan** hisoblanadi
   * (§14.1): ikkalasi ham xuddi shu `PaymentSchedule` qatorlaridan
   * kelib chiqadi, ya'ni ikkinchi so'rov faqat ma'lumotni takrorlagan
   * bo'lardi.
   *
   * `outstandingOfRows` (`../payments/allocation.service`) — qarz
   * qoldig'ining yagona formulasi (`Σ(amountDue − amountPaid)`), shu
   * yerda HAR BIR qatorga alohida qo'llaniladi: to'liq `amountDue`
   * emas, qisman to'langan qatorning QOLGAN qismi kerak.
   *
   * `storeRate` chaqiruvchidan keladi (`get()` da bir marta olingan,
   * §1.5) — `ReportsService.debtors()` dagi kabi qayta so'ramaymiz,
   * chunki u aynan shu ma'noni beradi: "bugungi kunga oxirgi ma'lum
   * do'kon kursi".
   */
  private async credit(
    day: string,
    storeRate: Prisma.Decimal | null,
  ): Promise<{ duePayments: DashboardDuePaymentDto[]; overdue: DashboardOverdueDto }> {
    const tomorrow = toCalendarDate(new Date(fromCalendarDate(day).getTime() + 86_400_000));

    const contracts = await this.prisma.installmentContract.findMany({
      where: { status: ContractStatus.ACTIVE },
      select: {
        currency: true,
        sale: {
          select: {
            customerId: true,
            customer: { select: { fullName: true, phonePrimary: true } },
          },
        },
        // `PAID` qatorlar ikkala blokka ham keraksiz — so'rovdan
        // chiqarib tashlanadi, jadvalda ular allaqachon yopilgan
        schedules: {
          where: { status: { not: ScheduleStatus.PAID } },
          select: { id: true, dueDate: true, amountDue: true, amountPaid: true },
          orderBy: { sequence: 'asc' },
        },
      },
    });

    const duePayments: DashboardDuePaymentDto[] = [];
    const overdueByCustomer = new Map<
      string,
      { customerName: string; daysOverdue: number; amounts: string[] }
    >();

    for (const contract of contracts) {
      // §9.1 — nasiya savdo mijozsiz tasdiqlanmaydi
      // (`SALE_CUSTOMER_REQUIRED`, `sale-confirmation.service.ts`), ya'ni
      // amalda bu holat bo'lmaydi. Tekshiruv faqat himoya uchun: Prisma
      // `sale.customer` ni nullable deb belgilagan (naqd savdoda mijoz
      // ixtiyoriy, §6.1), ya'ni tip darajasida bu yerni tashlab
      // yuborishga majbur qiladi — birinchi ekranni yiqitgandan ko'ra
      // shubhali qatorni chiqarib tashlash xavfsizroq
      const customerId = contract.sale.customerId;
      const customer = contract.sale.customer;
      if (!customerId || !customer) continue;

      for (const schedule of contract.schedules) {
        const outstanding = outstandingOfRows([schedule]);
        // §16.11 — ifodalab bo'lmaydigan qoldiq PAID bo'lmagan qatorda
        // ham qolishi mumkin, lekin u nasiya bloklarida "qarz" emas
        if (Number(outstanding) <= 0) continue;

        const dueDate = toCalendarDate(schedule.dueDate);

        // §14.3 — faqat bugun va ertaga, har qator o'z valyutasida
        if (dueDate === day || dueDate === tomorrow) {
          duePayments.push({
            installmentId: schedule.id,
            customerId,
            customerName: customer.fullName,
            phone: customer.phonePrimary,
            dueDate,
            amount: outstanding,
            currency: contract.currency,
          });
        }

        // §14.4 — mijoz bo'yicha jamlanadi, bazaviy valyutada
        if (dueDate < day) {
          const inBase =
            contract.currency === BASE_CURRENCY
              ? outstanding
              : storeRate
                ? convert(new Prisma.Decimal(outstanding), contract.currency, BASE_CURRENCY, storeRate)
                : // §1.5 — kurs yo'q bo'lsa nolga aylanadi, `debtors()` dagi
                  // xatti-harakat bilan bir xil: JIMGINA yo'qolmaydi, lekin
                  // dashboard ham kursi yo'q sabab yiqilmasligi kerak
                  '0';

          const entry = overdueByCustomer.get(customerId) ?? {
            customerName: customer.fullName,
            daysOverdue: 0,
            amounts: [],
          };
          // Eng eski to'lanmagan qator — eng katta kechikish
          entry.daysOverdue = Math.max(entry.daysOverdue, daysBetween(dueDate, day));
          entry.amounts.push(inBase);
          overdueByCustomer.set(customerId, entry);
        }
      }
    }

    // Tartib: `dueDate` bo'yicha o'sish, keyin summa bo'yicha kamayish
    duePayments.sort(
      (left, right) =>
        left.dueDate.localeCompare(right.dueDate) || Number(right.amount) - Number(left.amount),
    );

    const overdueCustomers: DashboardOverdueCustomerDto[] = [...overdueByCustomer.entries()].map(
      ([customerId, entry]) => ({
        customerId,
        customerName: entry.customerName,
        daysOverdue: entry.daysOverdue,
        amount: sumMoney(entry.amounts, BASE_CURRENCY),
      }),
    );

    // `debtors()` dagi bilan bir xil tartib: avval kechikish, keyin summa
    overdueCustomers.sort(
      (left, right) =>
        right.daysOverdue - left.daysOverdue || Number(right.amount) - Number(left.amount),
    );

    return {
      duePayments,
      overdue: {
        customersCount: overdueCustomers.length,
        totalAmount: sumMoney(
          overdueCustomers.map((row) => row.amount),
          BASE_CURRENCY,
        ),
        top: overdueCustomers.slice(0, OVERDUE_TOP_LIMIT),
      },
    };
  }

  // ──────────────────────────── §14.4 ────────────────────────────

  private async inventory(
    storeRate: Prisma.Decimal | null,
    showCost: boolean,
  ): Promise<DashboardDto['inventory']> {
    const [items, batches] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: { status: InventoryStatus.AVAILABLE },
        select: { productId: true, costPrice: true, costCurrency: true },
      }),
      this.prisma.inventoryBatch.findMany({
        where: { quantityRemaining: { gt: 0 } },
        select: { productId: true, quantityRemaining: true, unitCost: true, costCurrency: true },
      }),
    ]);

    const availableCount =
      items.length + batches.reduce((sum, batch) => sum + batch.quantityRemaining, 0);

    const totalCost = showCost
      ? sumMoney(
          [
            ...items.map((item) => this.toBase(item.costPrice, item.costCurrency, storeRate)),
            ...batches.map((batch) =>
              multiplyMoney(
                this.toBase(batch.unitCost, batch.costCurrency, storeRate),
                batch.quantityRemaining,
                BASE_CURRENCY,
              ),
            ),
          ],
          BASE_CURRENCY,
        )
      : null;

    return { availableCount, totalCost, lowStock: await this.lowStock(items, batches) };
  }

  /**
   * §3.8 — chegara mahsulotda bo'lmasa, sozlamalardagi umumiy chegara.
   *
   * Qoldiq shu yerda hisoblanadi (saqlanmaydi): saqlangan qoldiq har
   * savdo va qabulda yangilanishi kerak bo'lardi va bitta o'tkazib
   * yuborilgan yangilanish uni jimgina yolg'onga aylantirardi.
   */
  private async lowStock(
    items: { productId: string }[],
    batches: { productId: string; quantityRemaining: number }[],
  ): Promise<DashboardLowStockDto[]> {
    const quantities = new Map<string, number>();
    for (const item of items) {
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + 1);
    }
    for (const batch of batches) {
      quantities.set(
        batch.productId,
        (quantities.get(batch.productId) ?? 0) + batch.quantityRemaining,
      );
    }

    // `Shop` — SHOP_SCOPE_EXEMPT model (u tenant chegarasining o'zi), shuning
    // uchun `ShopsService.get()` orqali (u `requireShopId()` bilan aniq
    // `id`ni tanlaydi) — `where: { shopId }` YOZILMAYDI (§21.7).
    const shop = await this.shops.get();
    const fallback = shop.lowStockThreshold;

    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, displayName: true, lowStockThreshold: true },
    });

    return products
      .map((product) => ({
        productId: product.id,
        productName: product.displayName,
        quantity: quantities.get(product.id) ?? 0,
        threshold: product.lowStockThreshold ?? fallback,
      }))
      .filter((row) => row.quantity <= row.threshold)
      .sort((left, right) => left.quantity - right.quantity)
      .slice(0, LOW_STOCK_LIMIT);
  }

  /** §14.4 — kunlik tushum dinamikasi, bazaviy valyutada. */
  private async chart(
    day: string,
    _storeRate: Prisma.Decimal | null,
  ): Promise<DashboardChartPointDto[]> {
    const start = new Date(
      dayStartInstant(day, this.timeZone).getTime() - (CHART_DAYS - 1) * 86_400_000,
    );

    const sales = await this.prisma.sale.findMany({
      where: { status: { in: CONFIRMED_STATUSES }, soldAt: { gte: start } },
      select: { soldAt: true, total: true, currency: true, exchangeRate: true },
    });

    const byDay = new Map<string, string[]>();
    for (const sale of sales) {
      const key = businessDay(sale.soldAt, this.timeZone);
      const bucket = byDay.get(key) ?? [];
      bucket.push(convert(sale.total, sale.currency, BASE_CURRENCY, sale.exchangeRate));
      byDay.set(key, bucket);
    }

    const points: DashboardChartPointDto[] = [];
    for (let offset = CHART_DAYS - 1; offset >= 0; offset -= 1) {
      const date = businessDay(
        new Date(dayStartInstant(day, this.timeZone).getTime() - offset * 86_400_000),
        this.timeZone,
      );
      points.push({ date, revenue: sumMoney(byDay.get(date) ?? [], BASE_CURRENCY) });
    }
    return points;
  }

  /**
   * So'nggi amallar — savdo va kassa yozuvlari birga.
   *
   * Ikkalasi bitta ro'yxatda: ega uchun "bugun nima bo'ldi" degan
   * savolga javob bitta oqim, ikkita jadval emas.
   */
  private async activity(): Promise<DashboardActivityDto[]> {
    const [sales, entries] = await Promise.all([
      this.prisma.sale.findMany({
        where: { status: { in: CONFIRMED_STATUSES } },
        orderBy: { confirmedAt: 'desc' },
        take: ACTIVITY_LIMIT,
        select: { id: true, number: true, total: true, currency: true, confirmedAt: true },
      }),
      this.prisma.cashEntry.findMany({
        orderBy: { occurredAt: 'desc' },
        take: ACTIVITY_LIMIT,
        select: {
          id: true,
          direction: true,
          amount: true,
          currency: true,
          occurredAt: true,
          account: { select: { name: true } },
        },
      }),
    ]);

    const rows: DashboardActivityDto[] = [
      ...sales.map((sale) => ({
        id: sale.id,
        title: `Savdo ${sale.number ?? ''}`.trim(),
        at: (sale.confirmedAt ?? new Date()).toISOString(),
        amount: sale.total.toString(),
        currency: sale.currency as Currency,
      })),
      ...entries.map((entry) => ({
        id: entry.id,
        title: `${entry.direction === 'IN' ? 'Kirim' : 'Chiqim'} — ${entry.account.name}`,
        at: entry.occurredAt.toISOString(),
        amount: entry.amount.toString(),
        currency: entry.currency as Currency,
      })),
    ];

    return rows.sort((left, right) => right.at.localeCompare(left.at)).slice(0, ACTIVITY_LIMIT);
  }

  /**
   * Tannarxni bazaviy valyutaga keltirish.
   *
   * Kurs yo'q bo'lsa USD qiymat **tashlab yuborilmaydi va nolga ham
   * aylantirilmaydi** — ikkalasi ham ombor qiymatini yolg'on
   * ko'rsatardi; bunday holatda oxirgi ma'lum kurs bo'lmagani uchun
   * qiymat 0 bo'lib qoladi va UI kurs ogohlantirishini allaqachon
   * ko'rsatib turadi (§14.5).
   */
  private toBase(
    amount: Prisma.Decimal,
    currency: Currency,
    storeRate: Prisma.Decimal | null,
  ): string {
    if (currency === BASE_CURRENCY) return roundMoney(amount.toString(), BASE_CURRENCY);
    if (!storeRate) return roundMoney('0', BASE_CURRENCY);
    return convert(amount, currency, BASE_CURRENCY, storeRate);
  }
}

/** Hisobotga kiradigan savdolar: qaytarilgani ham savdo bo'lgan (§8). */
const CONFIRMED_STATUSES: SaleStatus[] = [
  SaleStatus.CONFIRMED,
  SaleStatus.PARTIALLY_RETURNED,
  SaleStatus.RETURNED,
];
