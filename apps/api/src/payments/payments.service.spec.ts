import {
  ContractStatus,
  Currency,
  ErrorCode,
  FileKind,
  PaymentMethod,
  PaymentStatus,
} from '@hisobai/contracts';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { AppException } from '../common/app.exception';
import type { RequestUser } from '../common/request-user';
import { PaymentsService } from './payments.service';

/**
 * §15.6, §10.3 — to'lovga chek surati biriktirish.
 *
 * Boshqa to'lov xulqi (taqsimot, qaytarish, o'tkazma tasdiqlash) alohida
 * moliyaviy mavzu (`money-ledger-engineer` doirasi) — bu spec faqat
 * 10-bosqich C qismida qo'shilgan IDOR himoyasini qamrab oladi.
 */
const ACTOR = { id: 'user-1' } as RequestUser;
const CONTRACT_ID = 'contract-1';

function makeService(files: Record<string, { kind: string }> = {}) {
  const fileAsset = {
    findFirst: ({ where }: { where: { id: string } }) =>
      Promise.resolve(files[where.id] ?? null),
  };
  const installmentContract = {
    findUnique: () =>
      Promise.resolve({
        id: CONTRACT_ID,
        currency: Currency.UZS,
        status: ContractStatus.ACTIVE,
      }),
  };
  const cashAccount = {
    findUnique: () =>
      Promise.resolve({ id: 'acc-1', currency: Currency.UZS, isActive: true, name: 'Naqd' }),
  };
  const createdPayments: Record<string, unknown>[] = [];
  const payment = {
    create: ({ data }: { data: Record<string, unknown> }) => {
      const row = {
        id: 'payment-1',
        contractId: CONTRACT_ID,
        saleId: null,
        paidAmount: data.paidAmount,
        paidCurrency: data.paidCurrency,
        exchangeRate: new Prisma.Decimal('1'),
        appliedAmount: data.appliedAmount,
        appliedCurrency: data.appliedCurrency,
        method: data.method,
        status: data.status,
        paidAt: data.paidAt,
        confirmedAt: data.confirmedAt ?? null,
        confirmedById: data.confirmedById ?? null,
        rejectedReason: null,
        receiptFileId: data.receiptFileId ?? null,
        cashAccountId: data.cashAccountId,
        createdById: data.createdById,
        reversesPaymentId: null,
        createdAt: new Date(),
      };
      createdPayments.push(row);
      return Promise.resolve(row);
    },
    findUniqueOrThrow: () => {
      const row = createdPayments[0];
      return Promise.resolve({
        ...row,
        cashAccount: { id: 'acc-1', name: 'Naqd' },
        contract: { id: CONTRACT_ID, sale: { id: 'sale-1', customerId: null, customer: null } },
        allocations: [],
      });
    },
  };

  const client = { fileAsset, installmentContract, cashAccount, payment };
  const prisma = { ...client, $transaction: <T>(fn: (tx: typeof client) => Promise<T>) => fn(client) };

  const rates = {
    requireForDate: () => Promise.resolve({ storeRate: new Prisma.Decimal('1') }),
  };
  const cashEntries = { createFromPayment: vi.fn(() => Promise.resolve()) };
  const allocation = {
    outstandingOf: () => Promise.resolve('1000000'),
    allocate: vi.fn(() => Promise.resolve()),
  };
  const audit = {
    record: vi.fn(() => Promise.resolve()),
  };
  const config = { get: () => 'Asia/Tashkent' };

  const service = new PaymentsService(
    prisma as never,
    rates as never,
    cashEntries as never,
    allocation as never,
    audit as never,
    config as never,
  );
  return { service, createdPayments };
}

async function expectAppException(promise: Promise<unknown>, code: string): Promise<AppException> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppException);
  const app = error as AppException;
  expect(app.code).toBe(code);
  return app;
}

const CREATE_INPUT = {
  contractId: CONTRACT_ID,
  amount: '100000',
  currency: Currency.UZS,
  method: PaymentMethod.CASH,
  cashAccountId: 'acc-1',
};

describe('PaymentsService.create — chek surati (§15.6, §10.3)', () => {
  it('boshqa Shop’ning faylini chek sifatida biriktirib bo‘lmaydi', async () => {
    const { service } = makeService();

    await expectAppException(
      service.create({ ...CREATE_INPUT, receiptFileId: 'boshqa-shop-fayli' }, ACTOR, null),
      ErrorCode.NOT_FOUND,
    );
  });

  it('noto‘g‘ri `kind`dagi faylni chek sifatida biriktirib bo‘lmaydi', async () => {
    const { service } = makeService({ 'file-1': { kind: FileKind.PASSPORT } });

    const error = await expectAppException(
      service.create({ ...CREATE_INPUT, receiptFileId: 'file-1' }, ACTOR, null),
      ErrorCode.VALIDATION_FAILED,
    );
    expect(error.field).toBe('fileId');
  });

  it('to‘g‘ri `kind`dagi fayl chek sifatida biriktiriladi', async () => {
    const { service, createdPayments } = makeService({ 'file-1': { kind: FileKind.RECEIPT } });

    const dto = await service.create({ ...CREATE_INPUT, receiptFileId: 'file-1' }, ACTOR, null);

    expect(dto.status).toBe(PaymentStatus.CONFIRMED);
    expect(createdPayments[0]?.receiptFileId).toBe('file-1');
  });
});
