import { CashDirection, CashSourceType, Currency, ErrorCode, UserRole } from '@hisobai/contracts';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { AppException } from '../common/app.exception';
import type { RequestUser } from '../common/request-user';
import { runWithShopScope } from '../database/shop-context';
import { CashEntriesService } from './cash-entries.service';

/**
 * T-11 (audit topilmasi) — `reverse()` uchun. Bu fayl `cash-entries.ts`
 * uchun BIRINCHI spec: modul avval umuman qamrovsiz edi.
 *
 * Diqqat markazida — §11.8 ning ikkinchi yarmi: "ertasiga faqat teskari
 * yozuv bilan". Har bir tekshiruv jimgina buzilsa **kassa hisoboti**
 * ikki xil yo'l bilan ikki xil ko'rinishga kelardi yoki bitta xato ikki
 * marta (yoki hech qachon) tuzatilmay qolardi:
 *
 *  - yo'nalish teskari bo'lmasa, tuzatish asl xatoni yana ikki
 *    barobarga oshirardi;
 *  - `occurredAt` asl sanaga yozilsa, allaqachon yopilgan kunning
 *    hisoboti orqadan o'zgarib ketardi (§11.8 ning butun maqsadi);
 *  - o'sha kun ichida teskari yozuvga ruxsat berilsa, bitta xatoni
 *    tuzatishning ikki yo'li (tahrirlash VA teskari yozuv) bir vaqtda
 *    ochiq bo'lib, kassa hisoboti kim qaysi yo'ldan borganiga qarab
 *    ikki xil chiqardi;
 *  - avtomatik (`MANUAL` bo'lmagan) yozuv teskari qilinsa, §11.7 buzilib,
 *    savdo/to'lov qaytarish mexanizmi bilan ziddiyat paydo bo'lardi;
 *  - bitta yozuv ikki marta teskari qilinsa, kassa xato summani ikki
 *    marta tuzatib qo'yardi.
 */

const ACTOR: RequestUser = {
  id: 'user-1',
  role: UserRole.SHOP_ADMIN,
  shopId: 'shop-1',
} as RequestUser;

const SHOP_ID = 'shop-1';
const ACCOUNT_ID = 'account-1';

interface OriginalFixture {
  id?: string;
  sourceType?: CashSourceType;
  direction?: CashDirection;
  amount?: string;
  currency?: Currency;
  accountId?: string;
  categoryId?: string | null;
  /** Kalendar kun `createdAt` bilan aniqlanadi (§11.8) — `occurredAt` emas. */
  createdAt?: Date;
  occurredAt?: Date;
  /** Mavjud teskari yozuv (ikki marta teskari qilishni sinash uchun). */
  existingReversalId?: string | null;
}

function makeService(fixture: OriginalFixture = {}) {
  const original = {
    id: fixture.id ?? 'entry-1',
    accountId: fixture.accountId ?? ACCOUNT_ID,
    direction: fixture.direction ?? CashDirection.OUT,
    amount: new Prisma.Decimal(fixture.amount ?? '50000'),
    currency: fixture.currency ?? Currency.UZS,
    occurredAt: fixture.occurredAt ?? new Date(Date.now() - 2 * 86_400_000),
    categoryId: fixture.categoryId ?? 'category-1',
    sourceType: fixture.sourceType ?? CashSourceType.MANUAL,
    sourceId: null,
    paymentId: null,
    note: 'Ijara haqi',
    createdById: 'user-0',
    reversesEntryId: null,
    // Sukut bo'yicha "kecha" — ko'pchilik testda §11.8 shart bajarilgan
    // holat kerak (bugun EMAS)
    createdAt: fixture.createdAt ?? new Date(Date.now() - 2 * 86_400_000),
    updatedAt: fixture.createdAt ?? new Date(Date.now() - 2 * 86_400_000),
  };

  const created: Record<string, unknown>[] = [];

  const tx = {
    cashEntry: {
      findUnique: vi.fn(() => Promise.resolve(original)),
      findFirst: vi.fn(() =>
        Promise.resolve(
          fixture.existingReversalId ? { id: fixture.existingReversalId } : null,
        ),
      ),
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return Promise.resolve({
          id: 'reversal-entry-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...args.data,
          account: { id: original.accountId, name: 'Naqd UZS' },
          category: null,
        });
      }),
    },
  };

  const prisma = {
    $transaction: vi.fn((handler: (client: unknown) => Promise<unknown>) => handler(tx)),
  };

  // Faqat konstruktor uchun — `reverse()` hech qachon bularni chaqirmaydi
  const accounts = {};

  const audit = {
    record: vi.fn(
      (_tx: unknown, _shopId: string | null, _entry: { action: string; after: unknown }) =>
        Promise.resolve(),
    ),
  };

  const config = { get: vi.fn(() => 'Asia/Tashkent') };

  const service = new CashEntriesService(
    prisma as never,
    accounts as never,
    audit as never,
    config as never,
  );

  return { service, original, created, tx, audit };
}

function reverseScoped(
  service: CashEntriesService,
  ...args: Parameters<CashEntriesService['reverse']>
): ReturnType<CashEntriesService['reverse']> {
  return runWithShopScope(SHOP_ID, () => service.reverse(...args));
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

const REASON = { reason: 'Kassachi summani ikki marta kiritib yuborgan' };

describe('CashEntriesService.reverse (§11.8 — T-11)', () => {
  it('qarama-qarshi yo‘nalishda, o‘sha summa/valyuta/hisob bilan teskari yozuv yaratadi', async () => {
    const { service, created } = makeService({
      direction: CashDirection.OUT,
      amount: '120000',
      currency: Currency.UZS,
      accountId: ACCOUNT_ID,
    });

    await reverseScoped(service, 'entry-1', REASON, ACTOR, null);

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      accountId: ACCOUNT_ID,
      direction: CashDirection.IN,
      currency: Currency.UZS,
      sourceType: CashSourceType.REVERSAL,
      reversesEntryId: 'entry-1',
    });
    expect((created[0]?.amount as Prisma.Decimal).toString()).toBe('120000');
  });

  it('kirim yozuvi teskari qilinsa — chiqim bo‘lib yaratiladi', async () => {
    const { service, created } = makeService({ direction: CashDirection.IN });

    await reverseScoped(service, 'entry-1', REASON, ACTOR, null);

    expect(created[0]?.direction).toBe(CashDirection.OUT);
  });

  it('occurredAt HOZIRGI vaqt — asl yozuvning sanasi EMAS', async () => {
    const oldOccurredAt = new Date(Date.now() - 10 * 86_400_000);
    const { service, created } = makeService({
      createdAt: new Date(Date.now() - 10 * 86_400_000),
      occurredAt: oldOccurredAt,
    });

    await reverseScoped(service, 'entry-1', REASON, ACTOR, null);

    const writtenAt = created[0]?.occurredAt as Date;
    expect(writtenAt.getTime()).toBeGreaterThan(oldOccurredAt.getTime());
    expect(Date.now() - writtenAt.getTime()).toBeLessThan(5000);
  });

  it('o‘sha kun ichida kiritilgan yozuv teskari qilinmaydi — tahrirlash/o‘chirish kerak', async () => {
    const { service } = makeService({ createdAt: new Date() });

    await expectAppException(
      reverseScoped(service, 'entry-1', REASON, ACTOR, null),
      ErrorCode.VALIDATION_FAILED,
    );
  });

  it('MANUAL bo‘lmagan (masalan PAYMENT) yozuv teskari qilinmaydi', async () => {
    const { service } = makeService({ sourceType: CashSourceType.PAYMENT });

    await expectAppException(
      reverseScoped(service, 'entry-1', REASON, ACTOR, null),
      ErrorCode.CASH_ENTRY_NOT_MANUAL,
    );
  });

  it('teskari yozuvning O‘ZI qayta teskari qilinmaydi (u ham MANUAL emas)', async () => {
    const { service } = makeService({ sourceType: CashSourceType.REVERSAL });

    await expectAppException(
      reverseScoped(service, 'entry-1', REASON, ACTOR, null),
      ErrorCode.CASH_ENTRY_NOT_MANUAL,
    );
  });

  it('allaqachon teskari qilingan yozuv ikkinchi marta teskari qilinmaydi', async () => {
    const { service } = makeService({ existingReversalId: 'reversal-old' });

    const error = await expectAppException(
      reverseScoped(service, 'entry-1', REASON, ACTOR, null),
      ErrorCode.VALIDATION_FAILED,
    );
    expect(error.details).toMatchObject({ reversalId: 'reversal-old' });
  });

  it('audit `record(tx, …)` bilan bitta tranzaksiyada yoziladi va sabab tushadi', async () => {
    const { service, audit, tx } = makeService();

    await reverseScoped(service, 'entry-1', REASON, ACTOR, null);

    expect(audit.record).toHaveBeenCalledOnce();
    const [txArg, shopId, entry] = audit.record.mock.calls[0] as [
      unknown,
      string | null,
      { action: string; after: Record<string, unknown> },
    ];
    // Bitta tranzaksiya ichida — `transaction-scope-audit.spec.ts` shu
    // naqshni talab qiladi
    expect(txArg).toBe(tx);
    expect(shopId).toBe(SHOP_ID);
    expect(entry.action).toBe('CASH_ENTRY_REVERSED');
    expect(entry.after).toMatchObject({ reason: REASON.reason });
  });

  it('kategoriya ko‘chirilmaydi — yo‘nalish teskari bo‘lgani uchun mos kelmasligi mumkin', async () => {
    const { service, created } = makeService({ categoryId: 'category-1' });

    await reverseScoped(service, 'entry-1', REASON, ACTOR, null);

    expect(created[0]?.categoryId).toBeUndefined();
  });

  it('mavjud bo‘lmagan yozuv — NOT_FOUND', async () => {
    const { service, tx } = makeService();
    tx.cashEntry.findUnique.mockResolvedValueOnce(null as never);

    await expectAppException(
      reverseScoped(service, 'yoq-id', REASON, ACTOR, null),
      ErrorCode.NOT_FOUND,
    );
  });
});
