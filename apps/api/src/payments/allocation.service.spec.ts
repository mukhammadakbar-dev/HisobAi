import { ContractStatus, Currency, ErrorCode, ScheduleStatus } from '@hisobai/contracts';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { AppException } from '../common/app.exception';
import { AllocationService } from './allocation.service';

/**
 * To'lovni taqsimlash (§10.1) — nasiyaning eng nozik hisobi.
 *
 * Buzilganda hech qanday xato ko'rinmaydi, faqat raqamlar yolg'on
 * bo'lib qoladi:
 *
 *  - tartib buzilsa, mijoz "qaysi oyni to'ladim" degan savolga javob
 *    ololmaydi va kechikish ogohlantirishi noto'g'ri qatorda chiqadi;
 *  - taqsimot qatorlari yozilmasa, to'lovni qaytarish (§10.6) qarzni
 *    aynan tiklay olmaydi;
 *  - qoldiq nolga tushganda shartnoma yopilmasa, to'langan qarz
 *    qarzdorlar ro'yxatida turaveradi;
 *  - §16.11 — ifodalab bo'lmaydigan tiyin qoldig'i abadiy qarz bo'lib
 *    osilib qolardi.
 */

interface ScheduleFixture {
  id: string;
  sequence: number;
  amountDue: string;
  amountPaid?: string;
  status?: ScheduleStatus;
}

function makeService(
  schedules: ScheduleFixture[],
  options: { contractStatus?: ContractStatus } = {},
) {
  const rows = schedules.map((row) => ({
    id: row.id,
    sequence: row.sequence,
    amountDue: new Prisma.Decimal(row.amountDue),
    amountPaid: new Prisma.Decimal(row.amountPaid ?? '0'),
    status: row.status ?? ScheduleStatus.UNPAID,
  }));

  const allocationRows: { paymentId: string; scheduleId: string; amount: Prisma.Decimal }[] = [];
  const scheduleUpdates: { id: string; data: Record<string, unknown> }[] = [];
  const contractUpdates: Record<string, unknown>[] = [];
  let contractStatus = options.contractStatus ?? ContractStatus.ACTIVE;

  const tx = {
    paymentSchedule: {
      /**
       * Dublyor `orderBy` ni ATAYLAB bajaradi: §10.1 ning butun ma'nosi
       * tartibda va uni e'tiborsiz qoldiradigan mock "eng eski qatordan
       * boshlanadi" degan testni yolg'on yashil qilardi (mutatsiya bilan
       * aniqlangan).
       */
      findMany: vi.fn(
        (args: {
          where: { status?: unknown };
          select?: unknown;
          orderBy?: { sequence?: string };
        }) => {
          if (args.select) return Promise.resolve(rows);

          const wanted = args.where.status;
          const visible =
            typeof wanted === 'string'
              ? rows.filter((row) => row.status === wanted)
              : rows.filter((row) => row.status !== ScheduleStatus.PAID);
          const direction = args.orderBy?.sequence === 'desc' ? -1 : 1;
          return Promise.resolve(
            [...visible].sort((left, right) => (left.sequence - right.sequence) * direction),
          );
        },
      ),
      findUniqueOrThrow: vi.fn((args: { where: { id: string } }) =>
        Promise.resolve(rows.find((row) => row.id === args.where.id)),
      ),
      update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
        scheduleUpdates.push({ id: args.where.id, data: args.data });
        const row = rows.find((item) => item.id === args.where.id);
        if (row) {
          if (args.data.amountPaid instanceof Prisma.Decimal) row.amountPaid = args.data.amountPaid;
          if (args.data.amountDue instanceof Prisma.Decimal) row.amountDue = args.data.amountDue;
          if (typeof args.data.status === 'string') row.status = args.data.status as ScheduleStatus;
        }
        return Promise.resolve({});
      }),
      delete: vi.fn((args: { where: { id: string } }) => {
        const index = rows.findIndex((row) => row.id === args.where.id);
        if (index >= 0) rows.splice(index, 1);
        return Promise.resolve({});
      }),
      updateMany: vi.fn((args: { data: { status: ScheduleStatus } }) => {
        for (const row of rows) {
          if (row.status !== ScheduleStatus.PAID) row.status = args.data.status;
        }
        return Promise.resolve({ count: rows.length });
      }),
    },
    paymentAllocation: {
      create: vi.fn(
        (args: { data: { paymentId: string; scheduleId: string; amount: Prisma.Decimal } }) => {
          allocationRows.push(args.data);
          return Promise.resolve({ id: `alloc-${String(allocationRows.length)}` });
        },
      ),
      findMany: vi.fn(() => Promise.resolve(allocationRows)),
      deleteMany: vi.fn(() => {
        allocationRows.length = 0;
        return Promise.resolve({ count: 0 });
      }),
    },
    installmentContract: {
      findUniqueOrThrow: vi.fn(() => Promise.resolve({ status: contractStatus })),
      update: vi.fn((args: { data: Record<string, unknown> }) => {
        contractUpdates.push(args.data);
        if (typeof args.data.status === 'string')
          contractStatus = args.data.status as ContractStatus;
        return Promise.resolve({});
      }),
    },
  };

  return {
    service: new AllocationService(),
    tx,
    rows,
    allocationRows,
    scheduleUpdates,
    contractUpdates,
  };
}

const SCHEDULE_3 = [
  { id: 'sch-1', sequence: 1, amountDue: '1000000' },
  { id: 'sch-2', sequence: 2, amountDue: '1000000' },
  { id: 'sch-3', sequence: 3, amountDue: '1000000' },
];

describe('AllocationService', () => {
  describe('taqsimlash (§10.1)', () => {
    it('eng eski to‘lanmagan qatordan boshlanadi', async () => {
      const { service, tx, allocationRows } = makeService(SCHEDULE_3);

      await service.allocate(tx as never, {
        contractId: 'contract-1',
        paymentId: 'payment-1',
        amount: '1500000',
        currency: Currency.UZS,
      });

      expect(
        allocationRows.map((row) => ({
          scheduleId: row.scheduleId,
          amount: row.amount.toString(),
        })),
      ).toEqual([
        { scheduleId: 'sch-1', amount: '1000000' },
        { scheduleId: 'sch-2', amount: '500000' },
      ]);
    });

    it('to‘liq yopilgan qator PAID, qisman to‘langani PARTIAL bo‘ladi', async () => {
      const { service, tx, rows } = makeService(SCHEDULE_3);

      await service.allocate(tx as never, {
        contractId: 'contract-1',
        paymentId: 'payment-1',
        amount: '1500000',
        currency: Currency.UZS,
      });

      expect(rows[0]?.status).toBe(ScheduleStatus.PAID);
      expect(rows[1]?.status).toBe(ScheduleStatus.PARTIAL);
      expect(rows[2]?.status).toBe(ScheduleStatus.UNPAID);
    });

    // Qator qoldig'i 600 000, to'lov esa 700 000: to'g'ri hisobda ortiqcha
    // 100 000 KEYINGI qatorga o'tadi. `amountPaid` e'tiborsiz qolsa,
    // hammasi birinchi qatorga tushib, u o'z summasidan oshib ketardi
    it('qisman to‘langan qatorning QOLGANI olinadi, butun summasi emas', async () => {
      const { service, tx, allocationRows, rows } = makeService([
        {
          id: 'sch-1',
          sequence: 1,
          amountDue: '1000000',
          amountPaid: '400000',
          status: ScheduleStatus.PARTIAL,
        },
        { id: 'sch-2', sequence: 2, amountDue: '1000000' },
      ]);

      await service.allocate(tx as never, {
        contractId: 'contract-1',
        paymentId: 'payment-2',
        amount: '700000',
        currency: Currency.UZS,
      });

      expect(
        allocationRows.map((row) => ({
          scheduleId: row.scheduleId,
          amount: row.amount.toString(),
        })),
      ).toEqual([
        { scheduleId: 'sch-1', amount: '600000' },
        { scheduleId: 'sch-2', amount: '100000' },
      ]);
      // Qator o'z summasidan oshib ketmasligi kerak
      expect(rows[0]?.amountPaid.toString()).toBe('1000000');
    });

    it('qarz to‘liq yopilganda shartnoma CLOSED bo‘ladi (§17.18)', async () => {
      const { service, tx, contractUpdates } = makeService([
        { id: 'sch-1', sequence: 1, amountDue: '1000000' },
      ]);

      await service.allocate(tx as never, {
        contractId: 'contract-1',
        paymentId: 'payment-1',
        amount: '1000000',
        currency: Currency.UZS,
      });

      expect(contractUpdates[0]).toMatchObject({ status: ContractStatus.CLOSED });
    });

    it('qarz qolganda shartnoma ACTIVE qoladi', async () => {
      const { service, tx, contractUpdates } = makeService(SCHEDULE_3);

      await service.allocate(tx as never, {
        contractId: 'contract-1',
        paymentId: 'payment-1',
        amount: '1000000',
        currency: Currency.UZS,
      });

      expect(contractUpdates).toHaveLength(0);
    });

    it('taqsimlanmagan qoldiq jimgina yo‘qolmaydi', async () => {
      const { service, tx } = makeService([{ id: 'sch-1', sequence: 1, amountDue: '1000000' }]);

      const error = await service
        .allocate(tx as never, {
          contractId: 'contract-1',
          paymentId: 'payment-1',
          amount: '1500000',
          currency: Currency.UZS,
        })
        .then(
          () => null,
          (caught: unknown) => caught,
        );

      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe(ErrorCode.PAYMENT_EXCEEDS_OUTSTANDING);
    });

    /**
     * §16.11 — valyuta aylanishida ifodalab bo'lmaydigan qoldiq paydo
     * bo'lishi mumkin. UZS eng kichik birligi 1 so'm, ustun esa
     * `Decimal(18,2)`: 0.50 so'mlik qoldiq saqlanadi, lekin uni mijoz
     * hech qachon to'lay olmaydi — bunday nominal umuman yo'q. U
     * to'silmasa, shartnoma abadiy "qarzdor" bo'lib qolardi.
     */
    it('eng kichik birlikdan kam qoldiqda shartnoma yopiladi (§16.11)', async () => {
      const { service, tx, contractUpdates, rows } = makeService([
        { id: 'sch-1', sequence: 1, amountDue: '1000000.50' },
      ]);

      await service.allocate(tx as never, {
        contractId: 'contract-1',
        paymentId: 'payment-1',
        amount: '1000000',
        currency: Currency.UZS,
      });

      expect(contractUpdates[0]).toMatchObject({ status: ContractStatus.CLOSED });
      expect(rows[0]?.status).toBe(ScheduleStatus.PAID);
    });
  });

  describe('qaytarish (§10.6)', () => {
    it('qarz AYNAN taqsimot qatorlari bo‘yicha tiklanadi', async () => {
      const { service, tx, rows } = makeService(SCHEDULE_3);

      await service.allocate(tx as never, {
        contractId: 'contract-1',
        paymentId: 'payment-1',
        amount: '1500000',
        currency: Currency.UZS,
      });
      await service.deallocate(tx as never, {
        paymentId: 'payment-1',
        contractId: 'contract-1',
        currency: Currency.UZS,
      });

      expect(rows.map((row) => row.amountPaid.toString())).toEqual(['0', '0', '0']);
      expect(rows.map((row) => row.status)).toEqual([
        ScheduleStatus.UNPAID,
        ScheduleStatus.UNPAID,
        ScheduleStatus.UNPAID,
      ]);
    });

    it('taqsimot qatorlari o‘chiriladi', async () => {
      const { service, tx, allocationRows } = makeService(SCHEDULE_3);

      await service.allocate(tx as never, {
        contractId: 'contract-1',
        paymentId: 'payment-1',
        amount: '1000000',
        currency: Currency.UZS,
      });
      await service.deallocate(tx as never, {
        paymentId: 'payment-1',
        contractId: 'contract-1',
        currency: Currency.UZS,
      });

      expect(allocationRows).toHaveLength(0);
    });

    // Yopilgan shartnoma qarzi tiklansa yana FAOL bo'lishi kerak — aks
    // holda qarzi bor, lekin yopilgan shartnoma qolardi va u hech bir
    // qarzdorlar ro'yxatiga tushmasdi
    it('yopilgan shartnoma qarz tiklanganda yana ACTIVE bo‘ladi', async () => {
      const { service, tx, contractUpdates } = makeService([
        { id: 'sch-1', sequence: 1, amountDue: '1000000' },
      ]);

      await service.allocate(tx as never, {
        contractId: 'contract-1',
        paymentId: 'payment-1',
        amount: '1000000',
        currency: Currency.UZS,
      });
      await service.deallocate(tx as never, {
        paymentId: 'payment-1',
        contractId: 'contract-1',
        currency: Currency.UZS,
      });

      expect(contractUpdates.map((row) => row.status)).toEqual([
        ContractStatus.CLOSED,
        ContractStatus.ACTIVE,
      ]);
    });

    // §17.18 — bekor qilingan shartnomani to'lov harakati tiriltirmasin
    it('bekor qilingan shartnoma holati o‘zgarmaydi', async () => {
      const { service, tx, contractUpdates } = makeService(SCHEDULE_3, {
        contractStatus: ContractStatus.CANCELLED,
      });

      await service.allocate(tx as never, {
        contractId: 'contract-1',
        paymentId: 'payment-1',
        amount: '1000000',
        currency: Currency.UZS,
      });

      expect(contractUpdates).toHaveLength(0);
    });
  });

  describe('qarz qoldig‘i', () => {
    it('jadvaldan hisoblanadi, ustunda saqlanmaydi', async () => {
      const { service, tx } = makeService([
        {
          id: 'sch-1',
          sequence: 1,
          amountDue: '1000000',
          amountPaid: '400000',
          status: ScheduleStatus.PARTIAL,
        },
        { id: 'sch-2', sequence: 2, amountDue: '1000000' },
      ]);

      const outstanding = await service.outstandingOf(tx as never, 'contract-1', Currency.UZS);

      expect(outstanding).toBe('1600000');
    });
  });

  /**
   * §16.12 — nasiya savdo qisman qaytarilganda qarzning kamayishi.
   *
   * Ikkita qoida qattiq: kamayish **faqat to'lanmagan** qatorlardan
   * (§9.10 — to'langanga taqsimot bog'langan) va **oxirgisidan
   * boshlab** (mijozning eng yaqin to'lov muddati joyida qolsin).
   */
  describe('qarzni kamaytirish (§16.12)', () => {
    it('oxirgi to‘lanmagan qatordan boshlab ayriladi', async () => {
      const { service, tx, rows } = makeService(SCHEDULE_3);

      const outcome = await service.reduceDebt(tx as never, {
        contractId: 'contract-1',
        amount: '1500000',
        currency: Currency.UZS,
      });

      // 3-qator butunlay yo'qoladi, 2-qator 500 000 ga kamayadi,
      // 1-qator (eng yaqin muddat) TEGILMAYDI
      expect(rows.map((row) => row.id)).toEqual(['sch-1', 'sch-2']);
      expect(rows[1]?.amountDue.toString()).toBe('500000');
      expect(rows[0]?.amountDue.toString()).toBe('1000000');
      expect(outcome).toEqual({ reduced: '1500000', unabsorbed: '0' });
    });

    it('to‘langan va qisman to‘langan qatorga TEGILMAYDI (§9.10)', async () => {
      const { service, tx, rows } = makeService([
        {
          id: 'sch-1',
          sequence: 1,
          amountDue: '1000000',
          amountPaid: '1000000',
          status: ScheduleStatus.PAID,
        },
        {
          id: 'sch-2',
          sequence: 2,
          amountDue: '1000000',
          amountPaid: '300000',
          status: ScheduleStatus.PARTIAL,
        },
        { id: 'sch-3', sequence: 3, amountDue: '1000000' },
      ]);

      const outcome = await service.reduceDebt(tx as never, {
        contractId: 'contract-1',
        amount: '2000000',
        currency: Currency.UZS,
      });

      // Faqat 3-qator yo'qoladi; qolgan 1 000 000 hech qayerdan ayrilmaydi
      expect(rows.map((row) => row.id)).toEqual(['sch-1', 'sch-2']);
      expect(outcome).toEqual({ reduced: '1000000', unabsorbed: '1000000' });
    });

    /**
     * §8.5 — to'lanmagan qatorlar yetmasa shartnoma yopiladi va
     * ortiqcha qism qaytarilmaydi: uni ega qo'lda hal qiladi. Tizim
     * o'zi pul chiqarsa, so'ralmagan qaytarim bo'lardi.
     */
    it('to‘lanmagan qatorlar yetmasa shartnoma yopiladi, ortig‘i qaytarilmaydi', async () => {
      const { service, tx, contractUpdates } = makeService([
        { id: 'sch-1', sequence: 1, amountDue: '1000000' },
      ]);

      const outcome = await service.reduceDebt(tx as never, {
        contractId: 'contract-1',
        amount: '3000000',
        currency: Currency.UZS,
      });

      expect(outcome).toEqual({ reduced: '1000000', unabsorbed: '2000000' });
      expect(contractUpdates[0]).toMatchObject({ status: ContractStatus.CLOSED });
    });

    it('qarz to‘liq qoplansa qolgan jadval bo‘shaydi', async () => {
      const { service, tx, rows } = makeService(SCHEDULE_3);

      await service.reduceDebt(tx as never, {
        contractId: 'contract-1',
        amount: '3000000',
        currency: Currency.UZS,
      });

      expect(rows).toHaveLength(0);
    });
  });
});
