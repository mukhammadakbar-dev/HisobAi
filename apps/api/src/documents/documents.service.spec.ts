import { ContractStatus, Currency, ErrorCode, UserRole } from '@hisobai/contracts';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { AppException } from '../common/app.exception';
import type { RequestUser } from '../common/request-user';
import { runWithShopScope } from '../database/shop-context';
import { DocumentsService } from './documents.service';

/**
 * Shartnoma PDF'i (§15.2, §15.3, §16.10).
 *
 * Ikkita qoida ustuvor tekshiriladi:
 *  - **dedup** — mazmun o'zgarmasa, yangi versiya ochilmaydi va MinIO'ga
 *    yozilmaydi (§15.2);
 *  - **CANCELLED shartnomaga hujjat yaratilmaydi**, lekin CLOSED
 *    shartnomaga ruxsat bor (topshiriqdagi farq: faqat CANCELLED
 *    to'sadi).
 */

const ACTOR: RequestUser = { id: 'user-1', role: UserRole.SHOP_ADMIN, shopId: 'shop-1' } as RequestUser;
const SHOP_ID = 'shop-1';

function makeContract(status: ContractStatus = ContractStatus.ACTIVE) {
  return {
    id: 'contract-1',
    saleId: 'sale-1',
    currency: Currency.UZS,
    cashPrice: new Prisma.Decimal('12300000'),
    markupAmount: new Prisma.Decimal('2460000'),
    markupPercent: new Prisma.Decimal('20'),
    downPayment: new Prisma.Decimal('4000000'),
    principal: new Prisma.Decimal('10760000'),
    status,
    closedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    sale: {
      id: 'sale-1',
      number: '2026-00147',
      customer: {
        fullName: 'Aliyev Vali',
        phonePrimary: '+998901112233',
        address: null,
        passportSeries: 'AB',
        passportNumber: '1234567',
        pinfl: null,
      },
      items: [
        {
          id: 'item-1',
          quantity: 1,
          unitPrice: new Prisma.Decimal('12300000'),
          product: { displayName: 'iPhone 15 Pro' },
          inventoryItem: { imei1: '111', imei2: null, serialNumber: null },
        },
      ],
    },
    schedules: [
      {
        id: 'sch-1',
        sequence: 1,
        dueDate: new Date('2026-09-01T00:00:00.000Z'),
        amountDue: new Prisma.Decimal('10760000'),
      },
    ],
  };
}

function makeService(contract: ReturnType<typeof makeContract>, latestDoc: Record<string, unknown> | null) {
  const shop = { id: SHOP_ID, name: "Tech Do'kon", address: null, phone: null };

  const createdFiles: Record<string, unknown>[] = [];
  const createdDocs: Record<string, unknown>[] = [];

  const tx = {
    fileAsset: {
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        createdFiles.push(args.data);
        return Promise.resolve({ id: 'file-1', ...args.data });
      }),
    },
    document: {
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        createdDocs.push(args.data);
        return Promise.resolve({
          id: 'doc-2',
          createdAt: new Date('2026-08-17T10:00:00.000Z'),
          ...args.data,
        });
      }),
    },
  };

  const prisma = {
    installmentContract: { findUnique: vi.fn(() => Promise.resolve(contract)) },
    shop: { findUniqueOrThrow: vi.fn(() => Promise.resolve(shop)) },
    document: {
      findFirst: vi.fn(() => Promise.resolve(latestDoc)),
      findMany: vi.fn(() => Promise.resolve(latestDoc ? [latestDoc] : [])),
    },
    $transaction: vi.fn((handler: (client: unknown) => Promise<unknown>) => handler(tx)),
  };

  const storage = { put: vi.fn(() => Promise.resolve()) };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const config = { get: vi.fn(() => 'Asia/Tashkent') };

  const service = new DocumentsService(prisma as never, storage as never, audit as never, config as never);
  return { service, prisma, storage, audit, createdDocs };
}

function scoped<T>(fn: () => Promise<T>): Promise<T> {
  return runWithShopScope(SHOP_ID, async () => await fn());
}

describe('DocumentsService', () => {
  it('birinchi generatsiyada 1-versiya yaratadi va MinIO`ga yozadi', async () => {
    const { service, storage, createdDocs } = makeService(makeContract(), null);

    const result = await scoped(() => service.generate('contract-1', ACTOR, null));

    expect(result.version).toBe(1);
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(createdDocs[0]).toMatchObject({ contractId: 'contract-1', version: 1 });
  });

  it('mazmun o`zgarmasa — yangi versiya ochilmaydi, MinIO`ga yozilmaydi (§15.2)', async () => {
    // Avval haqiqiy hashni olamiz — dedup aynan shu hash bilan solishtiradi.
    const { service: first } = makeService(makeContract(), null);
    const generated = await scoped(() => first.generate('contract-1', ACTOR, null));

    const latest = {
      id: 'doc-1',
      version: 1,
      fileId: 'file-0',
      contentHash: generated.contentHash,
      createdAt: new Date('2026-08-17T09:00:00.000Z'),
    };
    const { service, storage, prisma } = makeService(makeContract(), latest);

    const result = await scoped(() => service.generate('contract-1', ACTOR, null));

    expect(result.version).toBe(1);
    expect(result.documentId).toBe('doc-1');
    expect(storage.put).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('CANCELLED shartnomaga hujjat yaratilmaydi', async () => {
    const { service } = makeService(makeContract(ContractStatus.CANCELLED), null);

    const error: AppException = await scoped(() =>
      service.generate('contract-1', ACTOR, null),
    ).catch((caught: unknown) => caught as AppException);

    expect(error).toBeInstanceOf(AppException);
    expect(error.code).toBe(ErrorCode.INSTALLMENT_CONTRACT_NOT_ACTIVE);
  });

  it('CLOSED shartnomaga hujjat yaratish RUXSAT ETILADI (faqat CANCELLED to`sadi)', async () => {
    const { service, storage } = makeService(makeContract(ContractStatus.CLOSED), null);

    const result = await scoped(() => service.generate('contract-1', ACTOR, null));

    expect(result.version).toBe(1);
    expect(storage.put).toHaveBeenCalledTimes(1);
  });

  it('mavjud bo`lmagan shartnoma uchun NOT_FOUND', async () => {
    const contract = makeContract();
    const { service, prisma } = makeService(contract, null);
    prisma.installmentContract.findUnique = vi.fn(() => Promise.resolve(null));

    const error: AppException = await scoped(() =>
      service.generate('missing', ACTOR, null),
    ).catch((caught: unknown) => caught as AppException);

    expect(error).toBeInstanceOf(AppException);
    expect(error.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('listVersions — yangisidan eskisiga', async () => {
    const latest = {
      id: 'doc-2',
      version: 2,
      fileId: 'file-2',
      contentHash: 'abc',
      createdAt: new Date('2026-08-17T10:00:00.000Z'),
    };
    const { service } = makeService(makeContract(), latest);

    const versions = await scoped(() => service.listVersions('contract-1'));

    expect(versions).toEqual([
      { id: 'doc-2', version: 2, fileId: 'file-2', contentHash: 'abc', createdAt: latest.createdAt.toISOString() },
    ]);
  });
});
