import { ContractStatus, Currency, ErrorCode, ScheduleStatus, UserRole } from '@hisobai/contracts';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { AppException } from '../common/app.exception';
import type { RequestUser } from '../common/request-user';
import { runWithShopScope } from '../database/shop-context';
import { InstallmentsService } from './installments.service';

/**
 * Shartnoma ustidagi amallar (§9.10, §9.11, §9.12).
 *
 * Jadvalni qayta tuzish — nasiyaning eng xavfli tahriri: u qarzni
 * jimgina kechirish yoki oshirish vositasiga aylanib ketishi mumkin va
 * buni hech bir hisobot ko'rsatmasdi. Shuning uchun bu yerda ikki narsa
 * qattiq qulflanadi:
 *
 *  - §9.10 — to'langan va qisman to'langan qatorga TEGILMAYDI: ularga
 *    `payment_allocations` bog'langan;
 *  - §9.11 — umumiy qarz o'zgarmaydi, faqat taqsimot o'zgaradi.
 */

const ACTOR: RequestUser = {
  id: 'user-1',
  role: UserRole.SHOP_ADMIN,
  shopId: 'shop-1',
} as RequestUser;

const SHOP_ID = 'shop-1';

interface ScheduleFixture {
  id: string;
  sequence: number;
  amountDue: string;
  amountPaid?: string;
  status?: ScheduleStatus;
  dueDate?: string;
}

function makeService(
  schedules: ScheduleFixture[],
  options: { status?: ContractStatus; currency?: Currency } = {},
) {
  const contract = {
    id: 'contract-1',
    saleId: 'sale-1',
    currency: options.currency ?? Currency.UZS,
    cashPrice: new Prisma.Decimal('12000000'),
    markupAmount: new Prisma.Decimal('2400000'),
    markupPercent: null,
    downPayment: new Prisma.Decimal('4000000'),
    principal: new Prisma.Decimal('10400000'),
    status: options.status ?? ContractStatus.ACTIVE,
    closedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    sale: {
      id: 'sale-1',
      number: '2026-00147',
      customerId: 'customer-1',
      customer: { fullName: 'Ali' },
    },
    schedules: schedules.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      dueDate: new Date(`${row.dueDate ?? '2026-09-15'}T00:00:00.000Z`),
      amountDue: new Prisma.Decimal(row.amountDue),
      amountPaid: new Prisma.Decimal(row.amountPaid ?? '0'),
      status: row.status ?? ScheduleStatus.UNPAID,
    })),
  };

  const created: Record<string, unknown>[] = [];
  const deleted: string[] = [];

  const tx = {
    installmentContract: {
      findUnique: vi.fn(() => Promise.resolve(contract)),
      findUniqueOrThrow: vi.fn(() => Promise.resolve(contract)),
    },
    paymentSchedule: {
      deleteMany: vi.fn((args: { where: { id: { in: string[] } } }) => {
        deleted.push(...args.where.id.in);
        return Promise.resolve({ count: args.where.id.in.length });
      }),
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return Promise.resolve({});
      }),
    },
  };

  const prisma = {
    installmentContract: { findUnique: vi.fn(() => Promise.resolve(contract)) },
    cashAccount: { findUnique: vi.fn(() => Promise.resolve({ currency: Currency.UZS })) },
    $transaction: vi.fn((handler: (client: unknown) => Promise<unknown>) => handler(tx)),
  };
  const rates = {
    requireForDate: vi.fn(() => Promise.resolve({ storeRate: new Prisma.Decimal('12600') })),
  };
  const payments = {
    create: vi.fn((input: Record<string, unknown>) =>
      Promise.resolve({ id: 'payment-1', paidAmount: input.amount, paidCurrency: input.currency }),
    ),
  };
  const audit = {
    record: vi.fn(
      (_tx: unknown, _shopId: string | null, _entry: { action: string; after: unknown }) =>
        Promise.resolve(),
    ),
    recordDetached: vi.fn(() => Promise.resolve()),
  };
  const config = { get: vi.fn(() => 'Asia/Tashkent') };

  const service = new InstallmentsService(
    prisma as never,
    rates as never,
    payments as never,
    audit as never,
    config as never,
  );

  return { service, created, deleted, payments, audit, contract };
}

function scoped<T>(fn: () => Promise<T>): Promise<T> {
  return runWithShopScope(SHOP_ID, async () => await fn());
}

async function expectAppException(promise: Promise<unknown>, code: string): Promise<AppException> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppException);
  expect((error as AppException).code).toBe(code);
  return error as AppException;
}

describe('InstallmentsService', () => {
  describe('jadvalni qayta tuzish (§9.10)', () => {
    const MIXED: ScheduleFixture[] = [
      {
        id: 'sch-1',
        sequence: 1,
        amountDue: '2000000',
        amountPaid: '2000000',
        status: ScheduleStatus.PAID,
      },
      {
        id: 'sch-2',
        sequence: 2,
        amountDue: '2000000',
        amountPaid: '500000',
        status: ScheduleStatus.PARTIAL,
      },
      { id: 'sch-3', sequence: 3, amountDue: '3000000' },
      { id: 'sch-4', sequence: 4, amountDue: '3400000' },
    ];

    it('faqat to‘lanmagan qatorlar almashtiriladi', async () => {
      const { service, deleted } = makeService(MIXED);

      await scoped(() =>
        service.rebuildSchedule(
          'contract-1',
          {
            reason: 'Mijoz ish joyini o‘zgartirdi',
            schedule: [
              { dueDate: '2026-11-15', amount: '3200000' },
              { dueDate: '2026-12-15', amount: '3200000' },
            ],
          },
          ACTOR,
          null,
        ),
      );

      // To'langan va qisman to'langan qatorlarga tegilmagan
      expect(deleted).toEqual(['sch-3', 'sch-4']);
    });

    it('yangi qatorlar tegilmaganlaridan KEYIN raqamlanadi', async () => {
      const { service, created } = makeService(MIXED);

      await scoped(() =>
        service.rebuildSchedule(
          'contract-1',
          {
            reason: 'Muddat cho‘zildi',
            schedule: [
              { dueDate: '2026-11-15', amount: '3200000' },
              { dueDate: '2026-12-15', amount: '3200000' },
            ],
          },
          ACTOR,
          null,
        ),
      );

      // Tegilmagan qatorlar 1 va 2 raqamini SAQLAB qoladi (ularga to'lov
      // tarixi bog'langan), yangilari esa 3 dan davom etadi. Raqamlash
      // zich qoladi, ya'ni ekranda "3-oy" haqiqatan uchinchi qator
      expect(created.map((row) => row.sequence)).toEqual([3, 4]);
    });

    // §9.11 — umumiy qarz o'zgarmaydi; qisman to'langan qatorning
    // QOLDIG'I ham hisobga olinadi (2 000 000 − 500 000 emas, chunki u
    // almashtirilmaydi; almashtiriladigan 3 000 000 + 3 400 000)
    it('yangi jadval summasi qolgan qarzga teng bo‘lmasa rad etiladi', async () => {
      const { service } = makeService(MIXED);

      const error = await expectAppException(
        scoped(() =>
          service.rebuildSchedule(
            'contract-1',
            {
              reason: 'Kamaytirish urinishi',
              schedule: [{ dueDate: '2026-11-15', amount: '5000000' }],
            },
            ACTOR,
            null,
          ),
        ),
        ErrorCode.INSTALLMENT_SCHEDULE_SUM_MISMATCH,
      );

      expect(error.details).toMatchObject({ expected: '6400000', received: '5000000' });
    });

    it('to‘lanmagan qator qolmagan bo‘lsa rad etiladi', async () => {
      const { service } = makeService([
        {
          id: 'sch-1',
          sequence: 1,
          amountDue: '2000000',
          amountPaid: '2000000',
          status: ScheduleStatus.PAID,
        },
      ]);

      await expectAppException(
        scoped(() =>
          service.rebuildSchedule(
            'contract-1',
            { reason: 'Urinish', schedule: [{ dueDate: '2026-11-15', amount: '0.01' }] },
            ACTOR,
            null,
          ),
        ),
        ErrorCode.INSTALLMENT_SCHEDULE_ROW_PAID,
      );
    });

    it('yopilgan shartnomaning jadvali tahrirlanmaydi', async () => {
      const { service } = makeService(MIXED, { status: ContractStatus.CLOSED });

      await expectAppException(
        scoped(() =>
          service.rebuildSchedule(
            'contract-1',
            { reason: 'Urinish', schedule: [{ dueDate: '2026-11-15', amount: '6400000' }] },
            ACTOR,
            null,
          ),
        ),
        ErrorCode.INSTALLMENT_CONTRACT_NOT_ACTIVE,
      );
    });

    it('§9.11 — sabab audit‘ga yoziladi', async () => {
      const { service, audit } = makeService(MIXED);

      await scoped(() =>
        service.rebuildSchedule(
          'contract-1',
          { reason: 'Mijoz iltimosi', schedule: [{ dueDate: '2026-11-15', amount: '6400000' }] },
          ACTOR,
          null,
        ),
      );

      const entry = audit.record.mock.calls[0]?.[2];
      expect(entry?.action).toBe('INSTALLMENT_SCHEDULE_REBUILT');
      expect(entry?.after).toMatchObject({ reason: 'Mijoz iltimosi', total: '6400000' });
    });
  });

  describe('erta yopish (§9.12)', () => {
    const OPEN: ScheduleFixture[] = [
      {
        id: 'sch-1',
        sequence: 1,
        amountDue: '2000000',
        amountPaid: '2000000',
        status: ScheduleStatus.PAID,
      },
      { id: 'sch-2', sequence: 2, amountDue: '3000000' },
    ];

    it('qolgan qarz to‘lov sifatida yoziladi', async () => {
      const { service, payments } = makeService(OPEN);

      await scoped(() =>
        service.close(
          'contract-1',
          {
            expectedOutstanding: '3000000',
            method: 'CASH',
            cashAccountId: '11111111-1111-4111-8111-111111111111',
            note: null,
          },
          ACTOR,
          null,
        ),
      );

      // Alohida "yopish" mexanizmi yo'q — §17.2 bo'yicha kassaga pul
      // faqat to'lov orqali tushadi
      expect(payments.create).toHaveBeenCalledOnce();
      expect(payments.create.mock.calls[0]?.[0]).toMatchObject({
        contractId: 'contract-1',
        amount: '3000000',
      });
    });

    // Oradan o'tgan vaqtda boshqa to'lov tushgan bo'lishi mumkin: ega
    // o'zi ko'rgan summadan boshqa summani jimgina to'lab qo'ymasligi kerak
    it('ekrandagi qoldiq servernikidan farq qilsa rad etiladi', async () => {
      const { service, payments } = makeService(OPEN);

      await expectAppException(
        scoped(() =>
          service.close(
            'contract-1',
            {
              expectedOutstanding: '5000000',
              method: 'CASH',
              cashAccountId: '11111111-1111-4111-8111-111111111111',
              note: null,
            },
            ACTOR,
            null,
          ),
        ),
        ErrorCode.STALE_RESOURCE,
      );

      expect(payments.create).not.toHaveBeenCalled();
    });

    it('bekor qilingan shartnoma yopilmaydi', async () => {
      const { service } = makeService(OPEN, { status: ContractStatus.CANCELLED });

      await expectAppException(
        scoped(() =>
          service.close(
            'contract-1',
            {
              expectedOutstanding: '3000000',
              method: 'CASH',
              cashAccountId: '11111111-1111-4111-8111-111111111111',
              note: null,
            },
            ACTOR,
            null,
          ),
        ),
        ErrorCode.INSTALLMENT_CONTRACT_NOT_ACTIVE,
      );
    });
  });
});
