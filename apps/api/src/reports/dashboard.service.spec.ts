import { ContractStatus, Currency, ScheduleStatus, UserRole } from '@hisobai/contracts';
import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runWithShopScope } from '../database/shop-context';
import { DashboardService } from './dashboard.service';

/**
 * Dashboard nasiya bloklari (§14.3, §14.4).
 *
 * Bu bloklar uzoq vaqt **qattiq bo'sh** qaytarilgan edi va ekranda doim
 * nol turardi. Endi ular hisoblanadi, ya'ni ular jimgina noto'g'ri
 * bo'lishi mumkin — quyidagi testlar aynan shu jim xatolarni ushlaydi:
 *
 *  - butun qoldiq "kechikkan" deb sanalsa, raqam o'nlab marta shishadi;
 *  - USD qarz aylantirilmasa, 100$ 100 so'm bo'lib ko'rinadi;
 *  - `duePayments` aylantirilsa, §1.3 buziladi — mijoz qo'liga
 *    beradigan summa boshqa valyutaga o'tib ketardi;
 *  - "bugun/ertaga" chegarasi bir kunga siljisa, eslatma noto'g'ri kunga
 *    tushadi.
 */

const SHOP_ID = 'shop-1';
const RATE = new Prisma.Decimal('12500');

/** Sinov "bugun"i — Toshkent zonasida 2026-08-20. */
const NOW = new Date('2026-08-20T09:00:00.000Z');
const TODAY = '2026-08-20';
const TOMORROW = '2026-08-21';

interface ScheduleFixture {
  dueDate: string;
  amountDue: string;
  amountPaid?: string;
  status?: ScheduleStatus;
}

interface ContractFixture {
  id?: string;
  customerId?: string | null;
  customerName?: string;
  phone?: string;
  currency?: Currency;
  schedules: ScheduleFixture[];
}

interface Options {
  contracts?: ContractFixture[];
  lowStock?: { name: string; quantity: number }[];
  rateMissing?: boolean;
}

function makeService(options: Options = {}) {
  const contracts = (options.contracts ?? []).map((contract, index) => ({
    id: contract.id ?? `contract-${String(index + 1)}`,
    currency: contract.currency ?? Currency.UZS,
    sale: {
      customerId: contract.customerId === undefined ? `customer-${String(index + 1)}` : contract.customerId,
      customer:
        contract.customerId === null
          ? null
          : {
              fullName: contract.customerName ?? `Mijoz ${String(index + 1)}`,
              phonePrimary: contract.phone ?? '+998901234567',
            },
    },
    schedules: contract.schedules.map((row) => ({
      dueDate: new Date(`${row.dueDate}T00:00:00.000Z`),
      amountDue: new Prisma.Decimal(row.amountDue),
      amountPaid: new Prisma.Decimal(row.amountPaid ?? '0'),
      status: row.status ?? ScheduleStatus.UNPAID,
    })),
  }));

  const prisma = {
    sale: { findMany: vi.fn(() => Promise.resolve([])) },
    cashEntry: { findMany: vi.fn(() => Promise.resolve([])) },
    inventoryItem: { findMany: vi.fn(() => Promise.resolve([])) },
    inventoryBatch: { findMany: vi.fn(() => Promise.resolve([])) },
    product: {
      findMany: vi.fn(() =>
        Promise.resolve(
          (options.lowStock ?? []).map((row, index) => ({
            id: `product-${String(index + 1)}`,
            displayName: row.name,
            lowStockThreshold: null,
            inventoryItems: [],
            batches: [{ quantityRemaining: row.quantity }],
          })),
        ),
      ),
    },
    installmentContract: { findMany: vi.fn(() => Promise.resolve(contracts)) },
  };

  const accounts = { listBalances: vi.fn(() => Promise.resolve([])) };
  const rates = {
    getForDate: vi.fn(() =>
      Promise.resolve(options.rateMissing === true ? null : { storeRate: RATE }),
    ),
  };
  const shops = { get: vi.fn(() => Promise.resolve({ lowStockThreshold: 3 })) };
  const config = { get: vi.fn(() => 'Asia/Tashkent') };

  const service = new DashboardService(
    prisma as never,
    accounts as never,
    rates as never,
    shops as never,
    config as never,
  );

  return { service, prisma };
}

const ACTOR = { id: 'user-1', shopId: SHOP_ID, role: UserRole.SHOP_ADMIN } as never;

function get(options: Options = {}) {
  const { service } = makeService(options);
  return runWithShopScope(SHOP_ID, () => service.get(ACTOR, { period: 'today' }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DashboardService — muddati o‘tgan qarz', () => {
  it('kechikkan qatorni so‘mda hisoblaydi', async () => {
    const data = await get({
      contracts: [
        { schedules: [{ dueDate: '2026-08-10', amountDue: '1000000' }] },
      ],
    });

    expect(data.overdue.customersCount).toBe(1);
    expect(data.overdue.totalAmount.value).toBe('1000000');
    expect(data.overdue.top[0]?.daysOverdue).toBe(10);
    expect(data.overdue.top[0]?.amount).toBe('1000000');
  });

  /**
   * Eng muhim test: shartnomaning BUTUN qoldig'i emas, faqat muddati
   * o'tib ketgan qismi sanaladi. Aks holda 12 oylik shartnoma bir oy
   * kechikkanda raqam o'n barobar shishardi.
   */
  it('kelajakdagi qatorni qo‘shmaydi', async () => {
    const data = await get({
      contracts: [
        {
          schedules: [
            { dueDate: '2026-08-10', amountDue: '1000000' },
            { dueDate: '2026-09-10', amountDue: '1000000' },
          ],
        },
      ],
    });

    expect(data.overdue.totalAmount.value).toBe('1000000');
  });

  it('USD qarzni do‘kon kursi bilan so‘mga o‘giradi', async () => {
    const data = await get({
      contracts: [
        {
          currency: Currency.USD,
          schedules: [{ dueDate: '2026-08-15', amountDue: '100.00' }],
        },
      ],
    });

    // 100 × 12 500 = 1 250 000; so'm shkalasida kasr yo'q (§1.10)
    expect(data.overdue.top[0]?.amount).toBe('1250000');
    expect(data.overdue.totalAmount.value).toBe('1250000');
  });

  it('kurs yo‘q bo‘lsa yiqilmaydi va pul o‘ylab topmaydi', async () => {
    const data = await get({
      rateMissing: true,
      contracts: [
        {
          currency: Currency.USD,
          schedules: [{ dueDate: '2026-08-15', amountDue: '100.00' }],
        },
      ],
    });

    expect(data.overdue.customersCount).toBe(1);
    expect(data.overdue.totalAmount.value).toBe('0');
  });

  it('to‘langan qatorni hisobga olmaydi', async () => {
    const data = await get({
      contracts: [
        {
          schedules: [
            {
              dueDate: '2026-08-10',
              amountDue: '1000000',
              amountPaid: '1000000',
              status: ScheduleStatus.PAID,
            },
          ],
        },
      ],
    });

    expect(data.overdue.customersCount).toBe(0);
    expect(data.overdue.totalAmount.value).toBe('0');
    expect(data.overdue.top).toEqual([]);
  });

  it('bir mijozning ikki shartnomasini bitta qatorga yig‘adi', async () => {
    const data = await get({
      contracts: [
        {
          customerId: 'customer-1',
          schedules: [{ dueDate: '2026-08-10', amountDue: '500000' }],
        },
        {
          customerId: 'customer-1',
          schedules: [{ dueDate: '2026-08-18', amountDue: '700000' }],
        },
      ],
    });

    expect(data.overdue.customersCount).toBe(1);
    expect(data.overdue.top).toHaveLength(1);
    expect(data.overdue.top[0]?.amount).toBe('1200000');
    // Eng eski kechikish g'olib: 10 kun va 2 kundan kattasi
    expect(data.overdue.top[0]?.daysOverdue).toBe(10);
  });

  it('`top` qisqartiriladi, jami esa hammasi bo‘yicha qoladi', async () => {
    const data = await get({
      contracts: Array.from({ length: 7 }, (_, index) => ({
        customerId: `customer-${String(index + 1)}`,
        schedules: [{ dueDate: '2026-08-10', amountDue: '100000' }],
      })),
    });

    expect(data.overdue.customersCount).toBe(7);
    expect(data.overdue.top).toHaveLength(5);
    expect(data.overdue.totalAmount.value).toBe('700000');
  });

  it('avval ko‘proq kechikkani, keyin kattaroq summasi turadi', async () => {
    const data = await get({
      contracts: [
        {
          customerId: 'customer-1',
          schedules: [{ dueDate: '2026-08-18', amountDue: '900000' }],
        },
        {
          customerId: 'customer-2',
          schedules: [{ dueDate: '2026-08-01', amountDue: '100000' }],
        },
      ],
    });

    expect(data.overdue.top[0]?.customerId).toBe('customer-2');
    expect(data.overdue.top[1]?.customerId).toBe('customer-1');
  });

  it('mijozsiz shartnomani tashlab ketadi', async () => {
    const data = await get({
      contracts: [
        { customerId: null, schedules: [{ dueDate: '2026-08-10', amountDue: '1000000' }] },
      ],
    });

    expect(data.overdue.customersCount).toBe(0);
  });
});

describe('DashboardService — bugun va ertaga to‘lov', () => {
  it('faqat bugun va ertangi qatorlarni oladi', async () => {
    const data = await get({
      contracts: [
        { schedules: [{ dueDate: '2026-08-19', amountDue: '100000' }] },
        { schedules: [{ dueDate: TODAY, amountDue: '200000' }] },
        { schedules: [{ dueDate: TOMORROW, amountDue: '300000' }] },
        { schedules: [{ dueDate: '2026-08-22', amountDue: '400000' }] },
      ],
    });

    expect(data.duePayments).toHaveLength(2);
    expect(data.duePayments.map((row) => row.dueDate)).toEqual([TODAY, TOMORROW]);
  });

  /** §1.3 — qarz savdo valyutasida qoladi, hisobotdagidek o'girilmaydi. */
  it('shartnoma valyutasini saqlaydi', async () => {
    const data = await get({
      contracts: [
        {
          currency: Currency.USD,
          schedules: [{ dueDate: TODAY, amountDue: '250.00' }],
        },
      ],
    });

    expect(data.duePayments[0]?.amount).toBe('250.00');
    expect(data.duePayments[0]?.currency).toBe(Currency.USD);
  });

  it('qisman to‘langan qatorda qoldiqni ko‘rsatadi', async () => {
    const data = await get({
      contracts: [
        {
          schedules: [
            {
              dueDate: TODAY,
              amountDue: '1000000',
              amountPaid: '400000',
              status: ScheduleStatus.PARTIAL,
            },
          ],
        },
      ],
    });

    expect(data.duePayments[0]?.amount).toBe('600000');
  });

  it('telefon raqamini uzatadi — qo‘ng‘iroq havolasi uchun', async () => {
    const data = await get({
      contracts: [
        {
          phone: '+998939998877',
          schedules: [{ dueDate: TODAY, amountDue: '100000' }],
        },
      ],
    });

    expect(data.duePayments[0]?.phone).toBe('+998939998877');
  });
});

describe('DashboardService — mavjud bloklar buzilmadi', () => {
  it('kam qolgan mahsulotlar hisoblanaveradi', async () => {
    const data = await get({ lowStock: [{ name: 'Redmi Note 12', quantity: 1 }] });

    expect(data.inventory.lowStock).toHaveLength(1);
    expect(data.inventory.lowStock[0]?.productName).toBe('Redmi Note 12');
  });

  it('nasiya bo‘lmasa bloklar bo‘sh, lekin nol emas deb yolg‘on gapirmaydi', async () => {
    const data = await get();

    expect(data.duePayments).toEqual([]);
    expect(data.overdue.customersCount).toBe(0);
    expect(data.overdue.totalAmount.value).toBe('0');
    expect(data.currency).toBe('UZS');
  });

  it('faqat FAOL shartnomalarni so‘raydi', async () => {
    const { service, prisma } = makeService();
    await runWithShopScope(SHOP_ID, () => service.get(ACTOR, { period: 'today' }));

    expect(prisma.installmentContract.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: ContractStatus.ACTIVE } }),
    );
  });
});
