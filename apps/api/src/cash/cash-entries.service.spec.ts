import { CashDirection, Currency, ErrorCode, FileKind } from '@hisobai/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { AuditEntry } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import type { RequestUser } from '../common/request-user';
import { CashEntriesService } from './cash-entries.service';

/**
 * §20.9 — qo'lda kirim/chiqimga ilova (chek surati) biriktirish.
 *
 * Boshqa kassa xulqi (ayirboshlash, boshlang'ich qoldiq, to'lovdan
 * kirim) shu faylda sinalmaydi — bu modul uchun hozircha yagona spec,
 * shuning uchun doira ataylab tor: faqat 10-bosqich C qismida qo'shilgan
 * IDOR himoyasi.
 */
const ACTOR = { id: 'user-1' } as RequestUser;

function makeService(files: Record<string, { kind: string }> = {}) {
  const created: Record<string, unknown>[] = [];

  const fileAsset = {
    findFirst: ({ where }: { where: { id: string } }) =>
      Promise.resolve(files[where.id] ?? null),
  };
  const cashEntry = {
    create: ({ data }: { data: Record<string, unknown> }) => {
      created.push(data);
      return Promise.resolve({
        id: 'entry-1',
        accountId: data.accountId,
        direction: data.direction,
        amount: data.amount,
        currency: data.currency,
        occurredAt: data.occurredAt,
        categoryId: null,
        sourceType: data.sourceType,
        sourceId: null,
        paymentId: null,
        note: data.note ?? null,
        attachmentFileId: data.attachmentFileId ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
        account: { id: data.accountId, name: 'Naqd' },
        category: null,
      });
    },
  };

  const client = { fileAsset, cashEntry };
  const prisma = { ...client, $transaction: <T>(fn: (tx: typeof client) => Promise<T>) => fn(client) };

  const accounts = {
    requireActiveAccount: vi.fn(() =>
      Promise.resolve({ id: 'acc-1', currency: Currency.UZS, name: 'Naqd' }),
    ),
  };
  const audit = {
    record: vi.fn((_tx: unknown, _shopId: string | null, _entry: AuditEntry) => Promise.resolve()),
  };
  const config = { get: () => 'Asia/Tashkent' };

  const service = new CashEntriesService(
    prisma as never,
    accounts as never,
    audit as never,
    config as never,
  );
  return { service, created };
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
  accountId: 'acc-1',
  direction: CashDirection.OUT,
  amount: '10000',
};

describe('CashEntriesService.create — ilova (§20.9)', () => {
  it('boshqa Shop’ning faylini ilova sifatida biriktirib bo‘lmaydi', async () => {
    const { service } = makeService();

    await expectAppException(
      service.create({ ...CREATE_INPUT, attachmentFileId: 'boshqa-shop-fayli' }, ACTOR, null),
      ErrorCode.NOT_FOUND,
    );
  });

  it('noto‘g‘ri `kind`dagi faylni ilova sifatida biriktirib bo‘lmaydi', async () => {
    const { service } = makeService({ 'file-1': { kind: FileKind.RECEIPT } });

    const error = await expectAppException(
      service.create({ ...CREATE_INPUT, attachmentFileId: 'file-1' }, ACTOR, null),
      ErrorCode.VALIDATION_FAILED,
    );
    expect(error.field).toBe('fileId');
  });

  it('to‘g‘ri `kind`dagi fayl ilova sifatida biriktiriladi', async () => {
    const { service, created } = makeService({ 'file-1': { kind: FileKind.CASH_ATTACHMENT } });

    const entry = await service.create(
      { ...CREATE_INPUT, attachmentFileId: 'file-1' },
      ACTOR,
      null,
    );

    expect(entry.attachmentFileId).toBe('file-1');
    expect(created[0]?.attachmentFileId).toBe('file-1');
  });
});
