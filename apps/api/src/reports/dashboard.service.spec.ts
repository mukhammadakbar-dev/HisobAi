import { Currency, ScheduleStatus, Theme, UserRole } from '@hisobai/contracts';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { daysBetween, fromCalendarDate, toCalendarDate, today } from '../common/dates';
import type { RequestUser } from '../common/request-user';
import { DashboardService } from './dashboard.service';

/**
 * Nasiya bloklari (§14.3 "bugun/ertaga to'lovi keladiganlar", §14.4
 * "muddati o'tgan qarzlar") — audit T-10 topilmasi.
 *
 * Bu bloklar qattiq bo'sh qaytarilardi (7-bosqichda nasiya moduli hali
 * yo'q edi), 8-bosqich `InstallmentContract`/`PaymentSchedule` ni
 * yozgandan keyin bu allaqachon YOLG'ON bo'lib qoldi: ega "bugun hech
 * kim to'lamaydi" degan xulosaga kelardi, holbuki jadval qatorlari
 * bazada bor edi. Bu fayl aynan shu ikki blokning yangi hisobini
 * (`DashboardService.credit()`) sinaydi — ilgari bu servisda umuman
 * spec bo'lmagan.
 */

const TIMEZONE = 'Asia/Tashkent';
const DAY = today(TIMEZONE);
const TOMORROW = addDays(DAY, 1);
const DAY_AFTER_TOMORROW = addDays(DAY, 2);
const YESTERDAY = addDays(DAY, -1);

function addDays(day: string, amount: number): string {
  return toCalendarDate(new Date(fromCalendarDate(day).getTime() + amount * 86_400_000));
}

interface ScheduleFixture {
  id: string;
  dueDate: string;
  amountDue: string;
  amountPaid?: string;
  status?: ScheduleStatus;
}

interface ContractFixture {
  currency?: Currency;
  customerId?: string;
  customerName?: string;
  phone?: string;
  /** §9.1 himoya holatini sinash uchun — amalda bo'lmaydi. */
  noCustomer?: boolean;
  schedules: ScheduleFixture[];
}

interface Options {
  contracts?: ContractFixture[];
  storeRate?: string;
  rateMissing?: boolean;
}

// Bu bosqichda `UserRole` faqat `SHOP_ADMIN` ni biladi (§21 — tenant
// migratsiyasi, `SELLER` hali qaytarilmagan), ya'ni boshqa qiymat yo'q
const ACTOR: RequestUser = {
  id: 'user-1',
  email: 'admin@example.com',
  displayName: "Do'kon egasi",
  role: UserRole.SHOP_ADMIN,
  theme: Theme.LIGHT,
  sessionId: 'session-1',
  shopId: 'shop-1',
};

function makeService(options: Options = {}) {
  // Nasiya bloklari uchun `PaymentSchedule.status = PAID` bo'lgan
  // qatorlar DB SO'ROVINING O'ZIDA chiqarib tashlanadi (`credit()` dagi
  // `schedules.where`), TS mantig'ida emas — shuning uchun dublyor ham
  // AYNAN o'sha filtrni takrorlaydi, mock production so'rovni haqqoniy
  // aks ettirishi uchun
  const contracts = (options.contracts ?? []).map((contract) => ({
    currency: contract.currency ?? Currency.UZS,
    sale: contract.noCustomer
      ? { customerId: null, customer: null }
      : {
          customerId: contract.customerId ?? 'customer-1',
          customer: {
            fullName: contract.customerName ?? 'Aziz Karimov',
            phonePrimary: contract.phone ?? '+998901112233',
          },
        },
    schedules: contract.schedules
      .filter((schedule) => (schedule.status ?? ScheduleStatus.UNPAID) !== ScheduleStatus.PAID)
      .map((schedule) => ({
        id: schedule.id,
        dueDate: fromCalendarDate(schedule.dueDate),
        amountDue: new Prisma.Decimal(schedule.amountDue),
        amountPaid: new Prisma.Decimal(schedule.amountPaid ?? '0'),
      })),
  }));

  const prisma = {
    sale: { findMany: vi.fn(() => Promise.resolve([])) },
    inventoryItem: { findMany: vi.fn(() => Promise.resolve([])) },
    inventoryBatch: { findMany: vi.fn(() => Promise.resolve([])) },
    product: { findMany: vi.fn(() => Promise.resolve([])) },
    cashEntry: { findMany: vi.fn(() => Promise.resolve([])) },
    installmentContract: { findMany: vi.fn(() => Promise.resolve(contracts)) },
  };

  const accounts = { listBalances: vi.fn(() => Promise.resolve([])) };
  const rates = {
    getForDate: vi.fn(() =>
      Promise.resolve(
        options.rateMissing === true
          ? null
          : { storeRate: new Prisma.Decimal(options.storeRate ?? '12500') },
      ),
    ),
  };
  const shops = { get: vi.fn(() => Promise.resolve({ lowStockThreshold: 5 })) };
  const config = { get: vi.fn(() => TIMEZONE) };

  const service = new DashboardService(
    prisma as never,
    accounts as never,
    rates as never,
    shops as never,
    config as never,
  );

  return { service, prisma };
}

describe('DashboardService — nasiya bloklari', () => {
  describe('bugun/ertaga to‘lovi keladiganlar (§14.3)', () => {
    it('bugungi va ertangi qator ikkalasi ham tushadi, indingisi tushmaydi', async () => {
      const { service } = makeService({
        contracts: [
          {
            schedules: [
              { id: 'sch-today', dueDate: DAY, amountDue: '1000000' },
              { id: 'sch-tomorrow', dueDate: TOMORROW, amountDue: '2000000' },
              { id: 'sch-after', dueDate: DAY_AFTER_TOMORROW, amountDue: '3000000' },
            ],
          },
        ],
      });

      const dashboard = await service.get(ACTOR);

      expect(dashboard.duePayments.map((row) => row.installmentId)).toEqual([
        'sch-today',
        'sch-tomorrow',
      ]);
    });

    it('PAID qator tushmaydi', async () => {
      const { service } = makeService({
        contracts: [
          {
            schedules: [
              { id: 'sch-paid', dueDate: DAY, amountDue: '1000000', status: ScheduleStatus.PAID },
              { id: 'sch-unpaid', dueDate: DAY, amountDue: '1000000' },
            ],
          },
        ],
      });

      const dashboard = await service.get(ACTOR);

      expect(dashboard.duePayments.map((row) => row.installmentId)).toEqual(['sch-unpaid']);
    });

    // Qisman to'langan qatorning TO'LIQ `amountDue` i emas, QOLGAN
    // qismi ko'rsatilishi kerak — aks holda ega mijozdan allaqachon
    // olingan pulni yana kutib o'tirardi
    it('qisman to‘langan qator qolgan summa bilan tushadi', async () => {
      const { service } = makeService({
        contracts: [
          {
            schedules: [
              {
                id: 'sch-partial',
                dueDate: DAY,
                amountDue: '1000000',
                amountPaid: '400000',
                status: ScheduleStatus.PARTIAL,
              },
            ],
          },
        ],
      });

      const dashboard = await service.get(ACTOR);

      expect(dashboard.duePayments).toHaveLength(1);
      expect(dashboard.duePayments[0]?.amount).toBe('600000');
    });

    it('mijoz ismi va telefoni qatorga qo‘shiladi, valyuta shartnomaniki', async () => {
      const { service } = makeService({
        contracts: [
          {
            currency: Currency.USD,
            customerId: 'customer-9',
            customerName: 'Vali Aliyev',
            phone: '+998907654321',
            schedules: [{ id: 'sch-1', dueDate: DAY, amountDue: '100' }],
          },
        ],
      });

      const dashboard = await service.get(ACTOR);

      expect(dashboard.duePayments[0]).toMatchObject({
        customerId: 'customer-9',
        customerName: 'Vali Aliyev',
        phone: '+998907654321',
        currency: Currency.USD,
        amount: '100',
      });
    });

    it('tartib: sana bo‘yicha o‘sish, keyin summa bo‘yicha kamayish', async () => {
      const { service } = makeService({
        contracts: [
          {
            schedules: [
              { id: 'sch-tomorrow-small', dueDate: TOMORROW, amountDue: '500000' },
              { id: 'sch-today-small', dueDate: DAY, amountDue: '500000' },
              { id: 'sch-today-big', dueDate: DAY, amountDue: '1500000' },
            ],
          },
        ],
      });

      const dashboard = await service.get(ACTOR);

      expect(dashboard.duePayments.map((row) => row.installmentId)).toEqual([
        'sch-today-big',
        'sch-today-small',
        'sch-tomorrow-small',
      ]);
    });

    // §9.1 — nasiya savdo mijozsiz tasdiqlanmaydi (`SALE_CUSTOMER_REQUIRED`),
    // ya'ni bu amalda bo'lmaydi; tekshiruv faqat himoya: Prisma tipi
    // `sale.customer` ni nullable deb belgilagan (naqd savdoda ixtiyoriy)
    it('mijozsiz shartnoma (himoya holati) ro‘yxatga tushmaydi', async () => {
      const { service } = makeService({
        contracts: [{ noCustomer: true, schedules: [{ id: 'sch-1', dueDate: DAY, amountDue: '1' }] }],
      });

      const dashboard = await service.get(ACTOR);

      expect(dashboard.duePayments).toHaveLength(0);
    });
  });

  describe('muddati o‘tgan qarzlar (§14.4)', () => {
    it('bir mijozning ikkita shartnomasi bitta qatorga qo‘shiladi', async () => {
      const { service } = makeService({
        contracts: [
          {
            customerId: 'customer-1',
            schedules: [{ id: 'sch-1', dueDate: YESTERDAY, amountDue: '1000000' }],
          },
          {
            customerId: 'customer-1',
            schedules: [{ id: 'sch-2', dueDate: addDays(DAY, -10), amountDue: '500000' }],
          },
        ],
      });

      const dashboard = await service.get(ACTOR);

      expect(dashboard.overdue.customersCount).toBe(1);
      expect(dashboard.overdue.top).toHaveLength(1);
      expect(dashboard.overdue.top[0]?.amount).toBe('1500000');
      // Eng eski to'lanmagan qatordan — 10 kun oldingi, 1 kun oldingi emas
      expect(dashboard.overdue.top[0]?.daysOverdue).toBe(daysBetween(addDays(DAY, -10), DAY));
    });

    it('bugungi va kelajakdagi qator qarzdorlar ro‘yxatiga kirmaydi', async () => {
      const { service } = makeService({
        contracts: [
          {
            schedules: [
              { id: 'sch-today', dueDate: DAY, amountDue: '1000000' },
              { id: 'sch-tomorrow', dueDate: TOMORROW, amountDue: '1000000' },
            ],
          },
        ],
      });

      const dashboard = await service.get(ACTOR);

      expect(dashboard.overdue.customersCount).toBe(0);
      expect(dashboard.overdue.totalAmount).toBe('0');
    });

    it('valyuta bazaviyga (UZS) to‘g‘ri aylantiriladi', async () => {
      const { service } = makeService({
        storeRate: '12500',
        contracts: [
          {
            currency: Currency.USD,
            schedules: [{ id: 'sch-1', dueDate: YESTERDAY, amountDue: '100' }],
          },
        ],
      });

      const dashboard = await service.get(ACTOR);

      // 100 USD × 12 500 = 1 250 000 so'm (§3.1 — UZS ga ko'paytiriladi)
      expect(dashboard.overdue.totalAmount).toBe('1250000');
      expect(dashboard.overdue.top[0]?.amount).toBe('1250000');
    });

    it('kurs yo‘q bo‘lsa valyutali qarz nolga tushadi va yiqilmaydi (§1.5)', async () => {
      const { service } = makeService({
        rateMissing: true,
        contracts: [
          {
            currency: Currency.USD,
            schedules: [{ id: 'sch-1', dueDate: YESTERDAY, amountDue: '100' }],
          },
        ],
      });

      const dashboard = await service.get(ACTOR);

      expect(dashboard.overdue.customersCount).toBe(1);
      expect(dashboard.overdue.totalAmount).toBe('0');
      expect(dashboard.overdue.top[0]?.amount).toBe('0');
    });

    it('tartib: kechikish bo‘yicha kamayish, keyin summa bo‘yicha kamayish, top 5 tagacha', async () => {
      const { service } = makeService({
        contracts: Array.from({ length: 6 }, (_, index) => ({
          customerId: `customer-${String(index + 1)}`,
          customerName: `Mijoz ${String(index + 1)}`,
          schedules: [
            {
              id: `sch-${String(index + 1)}`,
              // eng birinchi mijoz eng ko'p kechikkan bo'lsin
              dueDate: addDays(DAY, -1 - index),
              amountDue: '1000000',
            },
          ],
        })),
      });

      const dashboard = await service.get(ACTOR);

      expect(dashboard.overdue.customersCount).toBe(6);
      expect(dashboard.overdue.top).toHaveLength(5);
      expect(dashboard.overdue.top.map((row) => row.customerName)).toEqual([
        'Mijoz 6',
        'Mijoz 5',
        'Mijoz 4',
        'Mijoz 3',
        'Mijoz 2',
      ]);
      // `totalAmount` HAMMASINI hisoblaydi, faqat `top` dagilarni emas
      expect(dashboard.overdue.totalAmount).toBe('6000000');
    });

    it('qarzi qolmagan (0 gacha to‘langan) qator qarzdorlar ro‘yxatiga tushmaydi', async () => {
      const { service } = makeService({
        contracts: [
          {
            schedules: [
              {
                id: 'sch-1',
                dueDate: YESTERDAY,
                amountDue: '1000000',
                amountPaid: '1000000',
                status: ScheduleStatus.PAID,
              },
            ],
          },
        ],
      });

      const dashboard = await service.get(ACTOR);

      expect(dashboard.overdue.customersCount).toBe(0);
    });
  });
});
