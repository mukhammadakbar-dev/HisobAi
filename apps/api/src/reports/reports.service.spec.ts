import {
  CashSourceType,
  Currency,
  SaleStatus,
  ScheduleStatus,
  StockMovementType,
} from '@hisobai/contracts';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { runWithShopScope } from '../database/shop-context';
import { ReportsService } from './reports.service';

/**
 * Davr hisoboti (§13) — har bir qoida jimgina buzilishi mumkin va
 * natijada ega **noto'g'ri raqamga qarab qaror qabul qiladi**:
 *
 *  - qaytarish aylanmadan ayrilmasa, savdo hajmi yo'qdan oshib ketadi;
 *  - qaytarishning foydasi teskarilanmasa, qaytarilgan telefon foyda
 *    keltirgandek ko'rinadi;
 *  - ustama yalpi foydaga qo'shilib ketsa, §17.3 buziladi va nasiya
 *    daromadi ikki marta sanaladi;
 *  - boshlang'ich qoldiq yoki ayirboshlash xarajat deb sanalsa, sof
 *    foyda yo'qdan kamayadi;
 *  - oldingi davr uzunligi noto'g'ri olinsa, `+33%` degan raqam
 *    ma'nosini yo'qotadi.
 */

const SHOP_ID = 'shop-1';
const RATE = new Prisma.Decimal('12500');

interface SaleFixture {
  status?: SaleStatus;
  total: string;
  currency?: Currency;
  items?: { quantity: number; unitPrice: string; costSnapshot: string }[];
  /** Qaysi davrga tushishi — `current` yoki `previous`. */
  period?: 'current' | 'previous';
}

interface Options {
  sales?: SaleFixture[];
  markups?: { amount: string; period?: 'current' | 'previous' }[];
  cashOut?: { amount: string; sourceType: CashSourceType; period?: 'current' | 'previous' }[];
  movements?: { type: StockMovementType; quantity: number; cost: string }[];
  stock?: { cost: string; currency?: Currency }[];
  rateMissing?: boolean;
  debtors?: unknown[];
  audit?: { action: string; actorId?: string }[];
}

/**
 * Davrni ajratish uchun sana: joriy davr — 2026-08-10..2026-08-19,
 * oldingisi — 2026-07-31..2026-08-09 (10 kunlik).
 */
const CURRENT_AT = new Date('2026-08-15T09:00:00.000Z');
const PREVIOUS_AT = new Date('2026-08-05T09:00:00.000Z');

function makeService(options: Options = {}) {
  const sales = (options.sales ?? []).map((sale) => ({
    status: sale.status ?? SaleStatus.CONFIRMED,
    currency: sale.currency ?? Currency.UZS,
    total: new Prisma.Decimal(sale.total),
    exchangeRate: RATE,
    soldAt: sale.period === 'previous' ? PREVIOUS_AT : CURRENT_AT,
    items: (sale.items ?? []).map((item) => ({
      quantity: item.quantity,
      unitPrice: new Prisma.Decimal(item.unitPrice),
      costSnapshot: new Prisma.Decimal(item.costSnapshot),
      costCurrency: Currency.UZS,
    })),
  }));

  const contracts = (options.markups ?? []).map((markup) => ({
    markupAmount: new Prisma.Decimal(markup.amount),
    currency: Currency.UZS,
    soldAt: markup.period === 'previous' ? PREVIOUS_AT : CURRENT_AT,
    sale: { exchangeRate: RATE },
  }));

  const entries = (options.cashOut ?? []).map((entry) => ({
    amount: new Prisma.Decimal(entry.amount),
    currency: Currency.UZS,
    sourceType: entry.sourceType,
    occurredAt: entry.period === 'previous' ? PREVIOUS_AT : CURRENT_AT,
  }));

  const movements = (options.movements ?? []).map((movement) => ({
    quantity: movement.quantity,
    type: movement.type,
    occurredAt: CURRENT_AT,
    inventoryItem: { costPrice: new Prisma.Decimal(movement.cost), costCurrency: Currency.UZS },
    batch: null,
  }));

  /** Dublyor sana oralig'ini HURMAT QILADI — davr ajratish sinaladi. */
  const inRange = (at: Date, where: { gte: Date; lt: Date }): boolean =>
    at.getTime() >= where.gte.getTime() && at.getTime() < where.lt.getTime();

  const prisma = {
    sale: {
      findMany: vi.fn((args: { where: { soldAt: { gte: Date; lt: Date } } }) =>
        Promise.resolve(sales.filter((sale) => inRange(sale.soldAt, args.where.soldAt))),
      ),
    },
    installmentContract: {
      findMany: vi.fn((args: { where?: { sale?: { soldAt: { gte: Date; lt: Date } } } }) => {
        // Qarzdorlar so'rovi `sale.soldAt` bo'yicha filtrlamaydi —
        // uni shu bilan ajratamiz
        if (!args.where?.sale) return Promise.resolve(options.debtors ?? []);
        const range = args.where.sale.soldAt;
        return Promise.resolve(contracts.filter((row) => inRange(row.soldAt, range)));
      }),
    },
    cashEntry: {
      findMany: vi.fn(
        (args: {
          where: { occurredAt: { gte: Date; lt: Date }; sourceType: { notIn: CashSourceType[] } };
        }) =>
          Promise.resolve(
            entries.filter(
              (entry) =>
                inRange(entry.occurredAt, args.where.occurredAt) &&
                !args.where.sourceType.notIn.includes(entry.sourceType),
            ),
          ),
      ),
    },
    stockMovement: {
      findMany: vi.fn((args: { where: { occurredAt: { gte: Date; lt: Date } } }) =>
        Promise.resolve(movements.filter((row) => inRange(row.occurredAt, args.where.occurredAt))),
      ),
    },
    saleItem: {
      findMany: vi.fn((args: { where: { sale: { soldAt: { gte: Date; lt: Date } } } }) =>
        Promise.resolve(
          sales
            .filter((sale) => inRange(sale.soldAt, args.where.sale.soldAt))
            .flatMap((sale) =>
              sale.items.map((item) => ({
                ...item,
                productId: 'product-1',
                product: { displayName: 'Sinov telefon' },
                sale: {
                  status: sale.status,
                  currency: sale.currency,
                  exchangeRate: sale.exchangeRate,
                },
              })),
            ),
        ),
      ),
    },
    inventoryItem: {
      findMany: vi.fn(() =>
        Promise.resolve(
          (options.stock ?? []).map((row) => ({
            costPrice: new Prisma.Decimal(row.cost),
            costCurrency: row.currency ?? Currency.UZS,
          })),
        ),
      ),
    },
    inventoryBatch: { findMany: vi.fn(() => Promise.resolve([])) },
    auditLog: {
      findMany: vi.fn(() =>
        Promise.resolve(
          (options.audit ?? []).map((row, index) => ({
            id: `log-${String(index + 1)}`,
            action: row.action,
            entityType: 'Sale',
            entityId: 'sale-1',
            actorId: row.actorId ?? null,
            beforeJson: null,
            afterJson: { total: '1' },
            ip: null,
            createdAt: CURRENT_AT,
          })),
        ),
      ),
    },
    user: {
      findMany: vi.fn(() => Promise.resolve([{ id: 'user-1', displayName: "Do'kon egasi" }])),
    },
    shopExchangeRate: {
      findFirst: vi.fn(() =>
        Promise.resolve(options.rateMissing === true ? null : { storeRate: RATE }),
      ),
    },
  };

  const config = { get: vi.fn(() => 'Asia/Tashkent') };
  return { service: new ReportsService(prisma as never, config as never), prisma };
}

/**
 * Qarzdor fiksturasi — shartnoma va uning jadvali.
 *
 * `dueDate` **o'tmishda** bo'lsa kechikish hisoblanadi (§9.8): u
 * saqlanmaydi, sanadan chiqadi.
 */
function debtor(options: {
  id: string;
  name: string;
  due: string;
  amountDue: string;
  amountPaid?: string;
}) {
  return {
    id: options.id,
    currency: Currency.UZS,
    sale: {
      number: '2026-00001',
      customerId: 'customer-1',
      customer: { fullName: options.name },
      exchangeRate: RATE,
    },
    schedules: [
      {
        dueDate: new Date(`${options.due}T00:00:00.000Z`),
        amountDue: new Prisma.Decimal(options.amountDue),
        amountPaid: new Prisma.Decimal(options.amountPaid ?? '0'),
        status: ScheduleStatus.UNPAID,
      },
    ],
  };
}

const PERIOD = { from: '2026-08-10', to: '2026-08-19' };

function summary(service: ReportsService) {
  return runWithShopScope(SHOP_ID, async () => await service.summary(PERIOD));
}

describe('ReportsService', () => {
  describe('aylanma va yalpi foyda (§13.3)', () => {
    it('sotuv − tannarx', async () => {
      const { service } = makeService({
        sales: [
          {
            total: '6000000',
            items: [{ quantity: 1, unitPrice: '6000000', costSnapshot: '4000000' }],
          },
        ],
      });

      const report = await summary(service);

      expect(report.revenue.value).toBe('6000000');
      expect(report.profit.grossProfit.value).toBe('2000000');
    });

    // §8 — qaytarish hisobotda ko'rinadi: aylanmadan ham, foydadan ham
    // ayriladi. Teskari qatorning `total` i manfiy, foydasi esa
    // qatorlardan MUSBAT chiqadi va qo'lda teskarilanadi
    it('qaytarish aylanmani ham, foydani ham kamaytiradi', async () => {
      const { service } = makeService({
        sales: [
          {
            total: '6000000',
            items: [{ quantity: 1, unitPrice: '6000000', costSnapshot: '4000000' }],
          },
          {
            status: SaleStatus.REVERSAL,
            total: '-6000000',
            items: [{ quantity: 1, unitPrice: '6000000', costSnapshot: '4000000' }],
          },
        ],
      });

      const report = await summary(service);

      expect(report.revenue.value).toBe('0');
      expect(report.profit.grossProfit.value).toBe('0');
    });

    it('teskari yozuv savdo soniga kirmaydi', async () => {
      const { service } = makeService({
        sales: [
          {
            total: '6000000',
            items: [{ quantity: 1, unitPrice: '6000000', costSnapshot: '4000000' }],
          },
          { status: SaleStatus.REVERSAL, total: '-6000000', items: [] },
        ],
      });

      const report = await summary(service);

      expect(report.saleCount.value).toBe('1');
    });
  });

  describe('sof foyda (§17.3, §17.12)', () => {
    it('nasiya ustamasi ALOHIDA satr — yalpi foydaga kirmaydi', async () => {
      const { service } = makeService({
        sales: [
          {
            total: '6000000',
            items: [{ quantity: 1, unitPrice: '6000000', costSnapshot: '4000000' }],
          },
        ],
        markups: [{ amount: '1200000' }],
      });

      const report = await summary(service);

      expect(report.profit.grossProfit.value).toBe('2000000');
      expect(report.profit.markupIncome.value).toBe('1200000');
      expect(report.profit.netProfit.value).toBe('3200000');
    });

    it('kassa xarajati sof foydani kamaytiradi', async () => {
      const { service } = makeService({
        sales: [
          {
            total: '6000000',
            items: [{ quantity: 1, unitPrice: '6000000', costSnapshot: '4000000' }],
          },
        ],
        cashOut: [{ amount: '500000', sourceType: CashSourceType.MANUAL }],
      });

      const report = await summary(service);

      expect(report.profit.cashExpenses.value).toBe('500000');
      expect(report.profit.netProfit.value).toBe('1500000');
    });

    // §11.4, §11.6 — boshlang'ich qoldiq harakat emas, ayirboshlash esa
    // pulni bir hisobdan ikkinchisiga ko'chiradi. Ikkalasini xarajat
    // deb sanash sof foydani YO'QDAN kamaytirardi
    it('boshlang‘ich qoldiq va ayirboshlash xarajat emas', async () => {
      const { service } = makeService({
        sales: [
          {
            total: '6000000',
            items: [{ quantity: 1, unitPrice: '6000000', costSnapshot: '4000000' }],
          },
        ],
        cashOut: [
          { amount: '900000', sourceType: CashSourceType.OPENING_BALANCE },
          { amount: '800000', sourceType: CashSourceType.EXCHANGE },
          { amount: '700000', sourceType: CashSourceType.REVERSAL },
        ],
      });

      const report = await summary(service);

      expect(report.profit.cashExpenses.value).toBe('0');
      expect(report.profit.netProfit.value).toBe('2000000');
    });

    /**
     * §17.12 — shaxsiy foydalanish va ombor yo'qotishlari kassadan pul
     * olib chiqmaydi, lekin mol do'kondan chiqib ketgan: foyda
     * kamayishi kerak.
     */
    it('pul bo‘lmagan xarajatlar tannarx bo‘yicha ayriladi', async () => {
      const { service } = makeService({
        sales: [
          {
            total: '6000000',
            items: [{ quantity: 1, unitPrice: '6000000', costSnapshot: '4000000' }],
          },
        ],
        movements: [
          { type: StockMovementType.PERSONAL_USE, quantity: 1, cost: '400000' },
          { type: StockMovementType.ADJUST, quantity: 2, cost: '100000' },
        ],
      });

      const report = await summary(service);

      expect(report.profit.nonCashExpenses.value).toBe('600000');
      expect(report.profit.netProfit.value).toBe('1400000');
    });
  });

  describe('oldingi davr bilan solishtiruv (§13.5)', () => {
    it('oldingi davr shu uzunlikda va bevosita oldin turadi', async () => {
      const { service } = makeService();

      const report = await summary(service);

      // 10–19 avgust = 10 kun, oldingisi 31 iyul – 9 avgust
      expect(report.previousFrom).toBe('2026-07-31');
      expect(report.previousTo).toBe('2026-08-09');
    });

    it('foiz o‘zgarishi hisoblanadi', async () => {
      const { service } = makeService({
        sales: [
          { total: '4000000', items: [] },
          { total: '3000000', items: [], period: 'previous' },
        ],
      });

      const report = await summary(service);

      expect(report.revenue.previous).toBe('3000000');
      // (4 000 000 − 3 000 000) / 3 000 000 = +33%
      expect(report.revenue.changePercent).toBe(33);
    });

    // Nolga bo'lish aniqlanmagan: "100%" deb ko'rsatish yolg'on bo'lardi,
    // chunki noldan o'sish har doim cheksiz
    it('oldingi davr nol bo‘lsa foiz null', async () => {
      const { service } = makeService({ sales: [{ total: '4000000', items: [] }] });

      const report = await summary(service);

      expect(report.revenue.changePercent).toBeNull();
    });

    it('oldingi davrdagi savdo joriy davrga qo‘shilmaydi', async () => {
      const { service } = makeService({
        sales: [
          { total: '4000000', items: [] },
          { total: '9999999', items: [], period: 'previous' },
        ],
      });

      const report = await summary(service);

      expect(report.revenue.value).toBe('4000000');
    });
  });

  describe('dinamika (§13.6)', () => {
    it('savdosiz kunlar ham nuqta sifatida qaytadi', async () => {
      const { service } = makeService({ sales: [{ total: '4000000', items: [] }] });

      const report = await runWithShopScope(
        SHOP_ID,
        async () => await service.series({ ...PERIOD, granularity: 'day' }),
      );

      // 10–19 avgust = 10 kun; ularsiz grafik uzuq bo'lardi va savdosiz
      // kun umuman ko'rinmasdi
      expect(report.points).toHaveLength(10);
      expect(report.points[0]?.date).toBe('2026-08-10');
      expect(report.points.at(-1)?.date).toBe('2026-08-19');
    });

    it('savdo o‘z kunidagi nuqtaga tushadi', async () => {
      const { service } = makeService({ sales: [{ total: '4000000', items: [] }] });

      const report = await runWithShopScope(
        SHOP_ID,
        async () => await service.series({ ...PERIOD, granularity: 'day' }),
      );

      const point = report.points.find((row) => row.date === '2026-08-15');
      expect(point?.revenue).toBe('4000000');
      expect(point?.saleCount).toBe(1);
    });

    // Hafta dushanbadan boshlanadi: 2026-08-15 — shanba, uning haftasi
    // 2026-08-10 (dushanba) dan boshlanadi
    it('haftalik qadamda dushanba olinadi', async () => {
      const { service } = makeService({ sales: [{ total: '4000000', items: [] }] });

      const report = await runWithShopScope(
        SHOP_ID,
        async () => await service.series({ ...PERIOD, granularity: 'week' }),
      );

      const point = report.points.find((row) => row.revenue !== '0');
      expect(point?.date).toBe('2026-08-10');
    });
  });

  describe('mahsulot bo‘yicha foyda (§13.7)', () => {
    it('miqdor, aylanma va foyda mahsulot bo‘yicha jamlanadi', async () => {
      const { service } = makeService({
        sales: [
          {
            total: '12000000',
            items: [{ quantity: 2, unitPrice: '6000000', costSnapshot: '4000000' }],
          },
        ],
      });

      const report = await runWithShopScope(
        SHOP_ID,
        async () => await service.topProducts({ ...PERIOD, limit: 10 }),
      );

      expect(report.products).toHaveLength(1);
      expect(report.products[0]).toMatchObject({
        quantity: 2,
        revenue: '12000000',
        profit: '4000000',
      });
    });

    // Aks holda qaytarilgan telefon "eng ko'p sotilgan" ro'yxatining
    // tepasida turib qolardi
    it('qaytarish miqdorni ham, foydani ham kamaytiradi', async () => {
      const { service } = makeService({
        sales: [
          {
            total: '12000000',
            items: [{ quantity: 2, unitPrice: '6000000', costSnapshot: '4000000' }],
          },
          {
            status: SaleStatus.REVERSAL,
            total: '-6000000',
            items: [{ quantity: 1, unitPrice: '6000000', costSnapshot: '4000000' }],
          },
        ],
      });

      const report = await runWithShopScope(
        SHOP_ID,
        async () => await service.topProducts({ ...PERIOD, limit: 10 }),
      );

      expect(report.products[0]).toMatchObject({
        quantity: 1,
        revenue: '6000000',
        profit: '2000000',
      });
    });
  });

  describe('ombor qiymati (§5.9)', () => {
    it('mavjud birliklar tannarxi jamlanadi', async () => {
      const { service } = makeService({ stock: [{ cost: '4000000' }, { cost: '3000000' }] });

      const report = await runWithShopScope(SHOP_ID, async () => await service.inventoryValue());

      expect(report.totalCost).toBe('7000000');
      expect(report.serializedCount).toBe(2);
      expect(report.rateMissing).toBe(false);
    });

    // Kurs yo'qligi JIMGINA nolga aylanmaydi — ombor qiymati sababsiz
    // kamayib ko'rinardi va ega buni bilmasdi
    it('kurs yo‘q bo‘lsa valyutali birlik baholanmaydi va bu aytiladi', async () => {
      const { service } = makeService({
        stock: [{ cost: '4000000' }, { cost: '500', currency: Currency.USD }],
        rateMissing: true,
      });

      const report = await runWithShopScope(SHOP_ID, async () => await service.inventoryValue());

      expect(report.totalCost).toBe('4000000');
      expect(report.rateMissing).toBe(true);
    });
  });

  describe('qarzdorlar (§13.8)', () => {
    /**
     * Tartib — ro'yxatning butun ma'nosi: u "kimga qo'ng'iroq qilish
     * kerak" degan savolga javob beradi. Alifbo yoki summa bo'yicha
     * saralash eng ko'p kechikkan mijozni ro'yxat o'rtasida yashirardi.
     */
    it('muddati o‘tganlar tepada, ko‘proq kechikkani birinchi', async () => {
      const { service } = makeService({
        debtors: [
          debtor({ id: 'c-1', name: 'Kechikmagan', due: '2027-01-01', amountDue: '5000000' }),
          debtor({ id: 'c-2', name: 'Uch kun', due: '2026-08-12', amountDue: '1000000' }),
          debtor({ id: 'c-3', name: 'O‘n kun', due: '2026-08-05', amountDue: '1000000' }),
        ],
      });

      const report = await runWithShopScope(SHOP_ID, async () => await service.debtors());

      expect(report.debtors.map((row) => row.customerName)).toEqual([
        'O‘n kun',
        'Uch kun',
        'Kechikmagan',
      ]);
      expect(report.overdueCount).toBe(2);
    });

    it('kechikish kunlari sanadan hisoblanadi (§9.8)', async () => {
      const { service } = makeService({
        debtors: [debtor({ id: 'c-1', name: 'Ali', due: '2026-08-12', amountDue: '1000000' })],
      });

      const report = await runWithShopScope(SHOP_ID, async () => await service.debtors());

      // Dublyorda "bugun" — 2026-08-15 emas, haqiqiy bugungi kun emas:
      // hisob sanalar ayirmasidan chiqadi, ya'ni nolga teng bo'lmaydi
      expect(report.debtors[0]?.daysOverdue).toBeGreaterThan(0);
      expect(report.debtors[0]?.nextDueDate).toBe('2026-08-12');
    });

    it('qarzi qolmagan shartnoma ro‘yxatga tushmaydi', async () => {
      const { service } = makeService({
        debtors: [
          debtor({
            id: 'c-1',
            name: 'To‘lagan',
            due: '2026-08-12',
            amountDue: '1000000',
            amountPaid: '1000000',
          }),
        ],
      });

      const report = await runWithShopScope(SHOP_ID, async () => await service.debtors());

      expect(report.debtors).toHaveLength(0);
      expect(report.totalOutstanding).toBe('0');
    });

    it('jami qoldiq bazaviy valyutada jamlanadi', async () => {
      const { service } = makeService({
        debtors: [
          debtor({ id: 'c-1', name: 'Ali', due: '2026-08-12', amountDue: '1000000' }),
          debtor({ id: 'c-2', name: 'Vali', due: '2027-01-01', amountDue: '2500000' }),
        ],
      });

      const report = await runWithShopScope(SHOP_ID, async () => await service.debtors());

      expect(report.totalOutstanding).toBe('3500000');
    });
  });

  describe('audit jurnali (§2.2)', () => {
    it('aktyor nomi alohida so‘rov bilan qo‘shiladi', async () => {
      const { service } = makeService({
        audit: [{ action: 'SALE_CONFIRMED', actorId: 'user-1' }],
      });

      const page = await runWithShopScope(SHOP_ID, async () => await service.auditLogs({}));

      // `actor_id` da FK YO'Q (§21.3 — ustunga ikki xil aktyor
      // yoziladi), ya'ni Prisma `include` ni tuzib bera olmaydi
      expect(page.data[0]?.actorName).toBe("Do'kon egasi");
      expect(page.data[0]?.action).toBe('SALE_CONFIRMED');
    });

    it('nomsiz aktyor null bo‘lib qoladi, yozuv esa yo‘qolmaydi', async () => {
      const { service } = makeService({ audit: [{ action: 'CBU_RATE_SYNCED' }] });

      const page = await runWithShopScope(SHOP_ID, async () => await service.auditLogs({}));

      expect(page.data).toHaveLength(1);
      expect(page.data[0]?.actorName).toBeNull();
    });
  });
});
