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
} from '@hisobai/contracts';
import { Prisma } from '@prisma/client';

import { CashAccountsService } from '../cash/cash-accounts.service';
import {
  businessDay,
  dayStartInstant,
  daysBetween,
  fromCalendarDate,
  toCalendarDate,
  today,
} from '../common/dates';
import { outstandingOfRows } from '../payments/allocation.service';
import type { RequestUser } from '../common/request-user';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { convert } from '../sales/sales.service';
import { ShopsService } from '../shops/shops.service';

/** §14.4 — grafik shuncha kunni ko'rsatadi. */
const CHART_DAYS = 14;
/** So'nggi amallar ro'yxati uzunligi. */
const ACTIVITY_LIMIT = 8;
/** "Kam qolgan" ro'yxatida ko'rsatiladigan mahsulotlar soni. */
const LOW_STOCK_LIMIT = 5;
/** Muddati o'tgan qarzdorlardan nechtasi dashboardda ko'rsatiladi. */
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
 * Nasiya bloklari (`duePayments`, `overdue`) faol shartnomalarning to'lov
 * jadvalidan hisoblanadi. Ikkita nozik joy bor:
 *
 *  - **"Kechikkan" saqlanmaydi** (§9.8) — u `dueDate < bugun` dan kelib
 *    chiqadi va "bugun" do'kon vaqt zonasida aniqlanadi.
 *  - `overdue` summalari **bazaviy valyutada**, do'konning BUGUNGI kursi
 *    bilan (`DashboardOverdueCustomerDto` da `currency` maydoni yo'q).
 *    Savdoning snapshot kursi emas: qolgan qarz o'tmishdagi hodisa emas,
 *    bugungi da'vo — ombor qiymati bilan bir mantiq (§5.9). `duePayments`
 *    esa aylantirilmaydi: qarz savdo valyutasida qoladi (§1.3) va u DTO
 *    o'z `currency` maydonini olib yuradi.
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

    const [sales, cashAccounts, inventory, chart, activity, installments] = await Promise.all([
      this.todaySales(dayStart, dayEnd, storeRate, showCost),
      showCost ? this.cash() : Promise.resolve(null),
      this.inventory(storeRate, showCost),
      this.chart(day, storeRate),
      this.activity(),
      // `day` va `storeRate` uzatiladi: hamma blok bitta "bugun" va bitta
      // kursga tayanishi kerak, aks holda bir sahifada ikki haqiqat bo'lardi
      this.installments(day, storeRate),
    ]);

    return {
      date: day,
      currency: BASE_CURRENCY,
      sales,
      duePayments: installments.duePayments,
      cashAccounts,
      overdue: installments.overdue,
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
   * §14.3, §14.4 — nasiya bloklari. Ikkalasi **bitta so'rovdan** yig'iladi:
   * har ikkisiga ham faol shartnomalarning to'lov jadvali kerak, ikki
   * marta o'qish esa §14.1 dagi "dashboard bitta so'rov" qoidasini buzardi.
   */
  private async installments(
    day: string,
    storeRate: Prisma.Decimal | null,
  ): Promise<Pick<DashboardDto, 'duePayments' | 'overdue'>> {
    const contracts = await this.prisma.installmentContract.findMany({
      where: { status: ContractStatus.ACTIVE },
      select: {
        id: true,
        currency: true,
        sale: {
          select: {
            customerId: true,
            customer: { select: { fullName: true, phonePrimary: true } },
          },
        },
        schedules: {
          select: { dueDate: true, amountDue: true, amountPaid: true, status: true },
          orderBy: { sequence: 'asc' },
        },
      },
    });

    /**
     * "Ertaga" kalendar SATRIDA hisoblanadi. `fromCalendarDate` UTC yarim
     * tunga bog'lanadi, UTC'da esa yozgi vaqt yo'q — ya'ni `+24 soat`
     * har doim aniq bir kun beradi. Do'kon zonasidagi instantni `@db.Date`
     * ustuni bilan aralashtirish aynan bir kunlik xato yashiradigan joy,
     * bu esa "Bugun" va "Ertaga" yorliqlarini almashtirib yuborardi.
     */
    const tomorrow = toCalendarDate(new Date(fromCalendarDate(day).getTime() + 86_400_000));

    const duePayments: DashboardDuePaymentDto[] = [];
    const byCustomer = new Map<string, { name: string; parts: string[]; daysOverdue: number }>();

    for (const contract of contracts) {
      const { customerId, customer } = contract.sale;
      /**
       * Nasiyada mijoz majburiy (§9); ustunning nullable bo'lishi sxema
       * izi. DTO'da esa `customerId` null bo'lolmaydi, shuning uchun
       * bunday shartnoma ikkala blokka ham kirmaydi.
       */
      if (customerId === null) continue;

      const nextUnpaid = contract.schedules.find((row) => row.status !== ScheduleStatus.PAID);
      if (nextUnpaid) {
        const due = toCalendarDate(nextUnpaid.dueDate);
        if (due === day || due === tomorrow) {
          duePayments.push({
            installmentId: contract.id,
            customerId,
            customerName: customer?.fullName ?? '',
            phone: customer?.phonePrimary ?? '',
            dueDate: due,
            // Qatorning QOLDIG'I: qisman to'langan qatorda to'liq summa
            // emas, hali to'lanmagani ko'rsatiladi
            amount: roundMoney(outstandingOfRows([nextUnpaid]), contract.currency),
            currency: contract.currency,
          });
        }
      }

      /**
       * **Faqat muddati o'tgan qism** — shartnomaning butun qoldig'i emas.
       * 12 oylik shartnoma bir oy kechikkanida butun qoldiqni "kechikkan"
       * deb ko'rsatish raqamni o'nlab marta shishirardi va u hech nimaga
       * mos kelmasdi: na jami qarzga (`/reports/debts`), na haqiqatan
       * kechikkan summaga. Bu blok "bugun kassada bo'lishi kerak edi"
       * degan savolga javob beradi.
       */
      const late = contract.schedules.filter(
        (row) => row.status !== ScheduleStatus.PAID && toCalendarDate(row.dueDate) < day,
      );
      if (late.length === 0) continue;

      const overdueAmount = outstandingOfRows(late);
      if (new Prisma.Decimal(overdueAmount).lessThanOrEqualTo(0)) continue;

      const amount = this.toBase(new Prisma.Decimal(overdueAmount), contract.currency, storeRate);
      // Jadval `sequence` bo'yicha saralangan, ya'ni birinchi kechikkan
      // qator eng eskisi — kechikish shundan hisoblanadi
      const oldest = late[0];
      const daysOverdue = oldest ? daysBetween(toCalendarDate(oldest.dueDate), day) : 0;

      const existing = byCustomer.get(customerId);
      if (existing) {
        existing.parts.push(amount);
        existing.daysOverdue = Math.max(existing.daysOverdue, daysOverdue);
      } else {
        byCustomer.set(customerId, {
          name: customer?.fullName ?? '',
          parts: [amount],
          daysOverdue,
        });
      }
    }

    const overdueRows: DashboardOverdueCustomerDto[] = [...byCustomer.entries()].map(
      ([customerId, row]) => ({
        customerId,
        customerName: row.name,
        daysOverdue: row.daysOverdue,
        // Har bir qism `toBase` da allaqachon yaxlitlangan, shuning uchun
        // jami ekrandagi qatorlar yig'indisiga aniq teng chiqadi
        amount: sumMoney(row.parts, BASE_CURRENCY),
      }),
    );

    overdueRows.sort(
      (left, right) =>
        // `Number(...)` bu yerda SARALASH KALITI, arifmetika emas: pul
        // hisobi yuqorida `sumMoney` bilan Decimal ustida bajarilgan
        right.daysOverdue - left.daysOverdue || Number(right.amount) - Number(left.amount),
    );

    duePayments.sort((left, right) => left.dueDate.localeCompare(right.dueDate));

    return {
      duePayments,
      overdue: {
        // Son va jami HAMMA qarzdor bo'yicha; `top` esa qisqartirilgan —
        // to'liq ro'yxat `/reports/debts` da (DTO izohiga qarang)
        customersCount: overdueRows.length,
        totalAmount: sumMoney(
          overdueRows.map((row) => row.amount),
          BASE_CURRENCY,
        ),
        top: overdueRows.slice(0, OVERDUE_TOP_LIMIT),
      },
    };
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
