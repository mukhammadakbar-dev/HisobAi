import {
  Currency,
  ErrorCode,
  PaymentMethod,
  PaymentStatus,
  SaleKind,
  SaleStatus,
  UserRole,
} from '@hisobai/contracts';
import type { ConfirmSaleInput } from '@hisobai/contracts';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { AppException } from '../common/app.exception';
import type { RequestUser } from '../common/request-user';
import { runWithShopScope } from '../database/shop-context';
import { SaleConfirmationService } from './sale-confirmation.service';

/**
 * Tasdiqlash — bosqichning eng qimmat amali (ARCHITECTURE §6).
 *
 * Bu yerdagi har bir tekshiruv jimgina buzilganda pul yoki ombor
 * yolg'on bo'lib qoladi:
 *
 *  - §17.5 ombor **shartli `UPDATE`** bilan band qilinadi va `count = 0`
 *    "birinchi tasdiqlagan oldi" degani;
 *  - §17.10 naqd savdoda to'lovlar yig'indisi savdo summasiga teng;
 *  - §17.2 kassaga pul faqat `CONFIRMED` to'lovdan tushadi — o'tkazma
 *    tasdiqlangunicha kassada ko'rinmaydi;
 *  - §7.6 raqam formati `2026-00001` va u faqat tasdiqlashda ajratiladi.
 */

const ACTOR = { id: 'user-1', role: UserRole.SHOP_ADMIN } as RequestUser;
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SHOP_ID = '22222222-2222-4222-8222-222222222222';
const RATE = new Prisma.Decimal('12500');

/**
 * Tasdiqlash **har doim** Shop konteksti ichida chaqiriladi: `allocateNumber`
 * hisoblagichni `shop_id` bo'yicha filtrlaydi (§21.9) va kontekstsiz
 * `requireShopId()` xato beradi.
 *
 * Testlar ham aynan shu shartda ishlashi kerak — aks holda ular ishlab
 * chiqarish yo'lidan farq qiladigan sharoitni tekshirgan bo'lardi.
 */
function confirmScoped(
  service: SaleConfirmationService,
  ...args: Parameters<SaleConfirmationService['confirm']>
): Promise<unknown> {
  return runWithShopScope(SHOP_ID, () => service.confirm(...args));
}

interface Options {
  /** `updateMany` nechta qatorni o'zgartirgani — 0 bo'lsa birlik band. */
  reservedCount?: number;
  items?: SaleItemFixture[];
  status?: SaleStatus;
  accountCurrency?: Currency;
}

interface SaleItemFixture {
  id: string;
  quantity: number;
  unitPrice: string;
  inventoryItemId?: string | null;
  batchId?: string | null;
}

const DEFAULT_ITEM: SaleItemFixture = {
  id: 'item-1',
  quantity: 1,
  unitPrice: '12000000',
  inventoryItemId: 'inv-1',
};

function makeService(options: Options = {}) {
  const items = (options.items ?? [DEFAULT_ITEM]).map((item) => ({
    id: item.id,
    productId: 'product-1',
    inventoryItemId: item.inventoryItemId ?? null,
    batchId: item.batchId ?? null,
    quantity: item.quantity,
    unitPrice: new Prisma.Decimal(item.unitPrice),
    costSnapshot: new Prisma.Decimal('10000000'),
    costCurrency: Currency.UZS,
    product: { id: 'product-1', displayName: 'Apple iPhone 15 Pro' },
  }));

  const sale = {
    id: 'sale-1',
    number: null,
    kind: SaleKind.CASH,
    status: options.status ?? SaleStatus.DRAFT,
    currency: Currency.UZS,
    exchangeRate: RATE,
    total: new Prisma.Decimal('0'),
    soldAt: new Date('2026-08-12T09:00:00.000Z'),
    confirmedAt: null,
    customerId: null,
    customer: null,
    createdAt: new Date('2026-08-12T08:00:00.000Z'),
    updatedAt: new Date('2026-08-12T08:00:00.000Z'),
    items,
    payments: [],
  };

  const payments: Record<string, unknown>[] = [];
  const cashEntries: Record<string, unknown>[] = [];
  const movements: Record<string, unknown>[] = [];
  const saleUpdates: Record<string, unknown>[] = [];

  const tx = {
    sale: {
      findUnique: vi.fn(() => Promise.resolve(sale)),
      findUniqueOrThrow: vi.fn(() => Promise.resolve({ ...sale, payments })),
      update: vi.fn((args: { data: Record<string, unknown> }) => {
        saleUpdates.push(args.data);
        return Promise.resolve({ ...sale, ...args.data, payments });
      }),
    },
    saleItem: { update: vi.fn(() => Promise.resolve({})) },
    inventoryItem: {
      updateMany: vi.fn(() => Promise.resolve({ count: options.reservedCount ?? 1 })),
      findUniqueOrThrow: vi.fn(() =>
        Promise.resolve({ costPrice: new Prisma.Decimal('10000000'), costCurrency: Currency.UZS }),
      ),
    },
    inventoryBatch: {
      updateMany: vi.fn(() => Promise.resolve({ count: options.reservedCount ?? 1 })),
      findUniqueOrThrow: vi.fn(() =>
        Promise.resolve({ unitCost: new Prisma.Decimal('50000'), costCurrency: Currency.UZS }),
      ),
    },
    stockMovement: {
      createMany: vi.fn((args: { data: Record<string, unknown>[] }) => {
        movements.push(...args.data);
        return Promise.resolve({ count: args.data.length });
      }),
    },
    cashAccount: {
      findMany: vi.fn(() =>
        Promise.resolve([
          {
            id: ACCOUNT_ID,
            currency: options.accountCurrency ?? Currency.UZS,
            isActive: true,
            name: 'Naqd UZS',
          },
        ]),
      ),
    },
    payment: {
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        const created = { id: `payment-${String(payments.length + 1)}`, ...args.data };
        payments.push(created);
        return Promise.resolve(created);
      }),
    },
    // Parametrlar ataylab e'lon qilingan: `$queryRaw` tagged template bo'lib
    // chaqiriladi va §21.9 testi aynan yuborilgan SQL matni bilan qiymatlarni
    // o'qiydi — imzosiz mock'da ular `never[]` bo'lib qolardi.
    $executeRaw: vi.fn((_sql: TemplateStringsArray, ..._values: unknown[]) => Promise.resolve(1)),
    $queryRaw: vi.fn((_sql: TemplateStringsArray, ..._values: unknown[]) =>
      Promise.resolve([{ last_seq: 1 }]),
    ),
  };

  const prisma = {
    $transaction: vi.fn((handler: (client: unknown) => Promise<unknown>) => handler(tx)),
  };
  const rates = { requireForDate: vi.fn(() => Promise.resolve({ storeRate: RATE })) };
  const cash = {
    createFromPayment: vi.fn((_tx: unknown, params: Record<string, unknown>) => {
      cashEntries.push(params);
      return Promise.resolve();
    }),
  };
  const audit = { record: vi.fn(() => Promise.resolve()) };
  const config = { get: vi.fn(() => 'Asia/Tashkent') };

  const service = new SaleConfirmationService(
    prisma as never,
    rates as never,
    cash as never,
    audit as never,
    config as never,
  );

  return { service, tx, payments, cashEntries, movements, saleUpdates, audit };
}

function confirmInput(overrides: Partial<ConfirmSaleInput> = {}): ConfirmSaleInput {
  return {
    payments: [
      {
        method: PaymentMethod.CASH,
        amount: '12000000',
        currency: Currency.UZS,
        cashAccountId: ACCOUNT_ID,
      },
    ],
    ...overrides,
  };
}

describe('SaleConfirmationService', () => {
  it('§7.6 — raqam ajratadi, holatni CONFIRMED qiladi va jamini qatorlardan hisoblaydi', async () => {
    const { service, saleUpdates } = makeService();

    await confirmScoped(service, 'sale-1', confirmInput(), ACTOR, null);

    expect(saleUpdates[0]).toMatchObject({
      number: '2026-00001',
      status: SaleStatus.CONFIRMED,
    });
    expect(String(saleUpdates[0]?.total)).toBe('12000000');
  });

  /**
   * §21.9 — hisoblagich `(shop_id, year)` bo'yicha, ya'ni har Shop uchun
   * mustaqil. Prisma extension'ining shop filtri **raw SQL'ga
   * qo'llanmaydi** (§21.8), shuning uchun bu yerdagi izolyatsiya faqat
   * qo'lda yozilgan `WHERE` shartiga bog'liq.
   *
   * `shop_id` tushib qolsa `UPDATE` barcha tenant'larning o'sha yilgi
   * qatorini oshiradi va `RETURNING` boshqa Shop'ning raqamini qaytarishi
   * mumkin — mijozga ko'rinadigan raqam boshqa do'konning savdo hajmini
   * oshkor qilardi.
   *
   * Shu sababli bu yerda **SQL matnining o'zi** tekshiriladi, natija emas:
   * mock'langan `$queryRaw` har qanday `WHERE` bilan ham "ishlab" ketadi,
   * ya'ni xatoni faqat so'rovni o'qib ushlash mumkin.
   */
  it('§21.9 — hisoblagich SQL ikkala bayonotda ham shop_id bilan chegaralanadi', async () => {
    const { service, tx } = makeService();

    await confirmScoped(service, 'sale-1', confirmInput(), ACTOR, null);

    const insertCall = tx.$executeRaw.mock.calls[0];
    const updateCall = tx.$queryRaw.mock.calls[0];
    expect(insertCall).toBeDefined();
    expect(updateCall).toBeDefined();

    const [insertSql, ...insertValues] = insertCall!;
    const [updateSql, ...updateValues] = updateCall!;

    expect(insertSql.join('?')).toContain('shop_id');
    expect(insertValues).toContain(SHOP_ID);

    expect(updateSql.join('?')).toMatch(/WHERE\s+shop_id\s*=/i);
    expect(updateValues).toContain(SHOP_ID);
  });

  it("§21.9 — Shop konteksti yo'q bo'lsa raqam umuman ajratilmaydi", async () => {
    const { service } = makeService();

    // Ishlab chiqarishda bu nuqtaga yetib borilmaydi: `PrismaService`
    // birinchi so'rovdayoq `SHOP_CONTEXT_MISSING` beradi. Bu yerda `prisma`
    // mock'langani uchun o'sha to'siq yo'q — ya'ni test aynan
    // `allocateNumber` ning O'Z himoyasini tekshiradi: u kontekstga tayanadi
    // va uni jimgina "yo'q" deb qabul qilmaydi.
    await expect(service.confirm('sale-1', confirmInput(), ACTOR, null)).rejects.toThrow(
      /Shop konteksti/,
    );
  });

  it("§17.5 — birlik band bo'lsa (count = 0) savdo tasdiqlanmaydi", async () => {
    const { service, saleUpdates } = makeService({ reservedCount: 0 });

    await expect(
      confirmScoped(service, 'sale-1', confirmInput(), ACTOR, null),
    ).rejects.toMatchObject({
      code: ErrorCode.SALE_ITEM_NOT_AVAILABLE,
    });
    // Hech narsa yozilmagan bo'lishi kerak — tranzaksiya yarim qolmaydi
    expect(saleUpdates).toHaveLength(0);
  });

  it("§17.10 — to'lovlar summasi savdo summasiga teng bo'lmasa rad etiladi", async () => {
    const { service } = makeService();

    const input = confirmInput({
      payments: [
        {
          method: PaymentMethod.CASH,
          amount: '5000000',
          currency: Currency.UZS,
          cashAccountId: ACCOUNT_ID,
        },
      ],
    });

    await expect(confirmScoped(service, 'sale-1', input, ACTOR, null)).rejects.toMatchObject({
      code: ErrorCode.SALE_PAYMENT_MISMATCH,
    });
  });

  it("§17.2 — naqd to'lov darhol CONFIRMED va kassaga tushadi", async () => {
    const { service, payments, cashEntries } = makeService();

    await confirmScoped(service, 'sale-1', confirmInput(), ACTOR, null);

    expect(payments[0]).toMatchObject({ status: PaymentStatus.CONFIRMED });
    expect(cashEntries).toHaveLength(1);
    expect(cashEntries[0]).toMatchObject({ accountId: ACCOUNT_ID, amount: '12000000' });
  });

  it("§17.2 — o'tkazma PENDING_VERIFICATION va kassaga TUSHMAYDI", async () => {
    const { service, payments, cashEntries } = makeService();

    const input = confirmInput({
      payments: [
        {
          method: PaymentMethod.TRANSFER,
          amount: '12000000',
          currency: Currency.UZS,
          cashAccountId: ACCOUNT_ID,
        },
      ],
    });
    await confirmScoped(service, 'sale-1', input, ACTOR, null);

    expect(payments[0]).toMatchObject({ status: PaymentStatus.PENDING_VERIFICATION });
    expect(cashEntries).toHaveLength(0);
  });

  it('§11.1 — hisob valyutasi to‘lov valyutasiga mos kelmasa rad etiladi', async () => {
    const { service } = makeService({ accountCurrency: Currency.USD });

    await expect(
      confirmScoped(service, 'sale-1', confirmInput(), ACTOR, null),
    ).rejects.toMatchObject({
      code: ErrorCode.PAYMENT_ACCOUNT_CURRENCY_MISMATCH,
    });
  });

  it('§7.7 — bo‘sh savat tasdiqlanmaydi', async () => {
    const { service } = makeService({ items: [] });

    await expect(
      confirmScoped(service, 'sale-1', confirmInput(), ACTOR, null),
    ).rejects.toMatchObject({
      code: ErrorCode.SALE_EMPTY,
    });
  });

  it('tasdiqlangan savdo qayta tasdiqlanmaydi', async () => {
    const { service } = makeService({ status: SaleStatus.CONFIRMED });

    await expect(
      confirmScoped(service, 'sale-1', confirmInput(), ACTOR, null),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('§5.10 — har qator uchun SALE harakati yoziladi', async () => {
    const { service, movements } = makeService();

    await confirmScoped(service, 'sale-1', confirmInput(), ACTOR, null);

    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ type: 'SALE', quantity: 1, referenceType: 'SALE' });
  });
});
