import {
  ContractStatus,
  Currency,
  ErrorCode,
  InventoryStatus,
  PaymentMethod,
  PaymentStatus,
  ReversalKind,
  ReversalReason,
  SaleKind,
  SaleStatus,
  StockMovementType,
  UserRole,
} from '@hisobai/contracts';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { AppException } from '../common/app.exception';
import type { RequestUser } from '../common/request-user';
import { runWithShopScope } from '../database/shop-context';
import { SaleReversalService } from './sale-reversal.service';

/**
 * Qaytarish va bekor qilish — pul va ombor bir vaqtda o'zgaradigan
 * ikkinchi joy (birinchisi — tasdiqlash). Bu yerdagi har bir tekshiruv
 * jimgina buzilganda **hisobot yolg'on chiqadi**, ilova esa ishlashda
 * davom etadi:
 *
 *  - teskari yozuv asl kursda bo'lmasa (§8.1), savdo nolga chiqmaydi va
 *    yo'qdan foyda/zarar paydo bo'ladi;
 *  - qaytarish asl savdo sanasiga yozilsa (§8.7 buzilsa), yopilgan
 *    davrning aylanmasi orqadan o'zgarib ketadi;
 *  - bekor qilish o'z sanasiga yozilsa (§16.5 buzilsa), savdo "umuman
 *    bo'lmagandek" bo'lmaydi;
 *  - qaytarilgan miqdor nazorat qilinmasa, bitta telefonni ikki marta
 *    qaytarib, ombor qoldig'ini yo'qdan oshirib yuborish mumkin;
 *  - pul to'lov tushgan hisobdan chiqmasa (§11.1), kassani sanab
 *    solishtirib bo'lmaydi.
 */

const ACTOR: RequestUser = {
  id: 'user-1',
  role: UserRole.SHOP_ADMIN,
  shopId: 'shop-1',
} as RequestUser;

const SHOP_ID = 'shop-1';
const RATE = new Prisma.Decimal('12600');
const SOLD_AT = new Date('2026-08-12T09:00:00.000Z');
const ACCOUNT_ID = 'account-1';

interface ItemFixture {
  id: string;
  quantity?: number;
  returnedQuantity?: number;
  unitPrice?: string;
  inventoryItemId?: string | null;
  batchId?: string | null;
}

interface PaymentFixture {
  id?: string;
  status?: PaymentStatus;
  paidAmount?: string;
  paidCurrency?: Currency;
  appliedAmount?: string;
  cashAccountId?: string | null;
}

interface Options {
  status?: SaleStatus;
  soldAt?: Date;
  items?: ItemFixture[];
  payments?: PaymentFixture[];
  /** Mavjud teskari qatorlar soni — `-R2` raqami shundan chiqadi. */
  reversalCount?: number;
  /** Ombor birligi allaqachon boshqa holatda — shartli `UPDATE` 0 qaytaradi. */
  restockCount?: number;
  /** To'lov id → shu to'lovdan ilgari qaytarilgan pul (to'lov valyutasida). */
  alreadyRefunded?: Record<string, string>;
  /** Savdoga bog'langan nasiya shartnomasi (§17.18, §16.12). */
  contract?: {
    id: string;
    status: ContractStatus;
    cashPrice?: string;
    markupAmount?: string;
  } | null;
}

function makeService(options: Options = {}) {
  const items = (options.items ?? [{ id: 'item-1' }]).map((item) => ({
    id: item.id,
    productId: 'product-1',
    inventoryItemId: item.inventoryItemId === undefined ? 'inv-1' : item.inventoryItemId,
    batchId: item.batchId ?? null,
    quantity: item.quantity ?? 1,
    returnedQuantity: item.returnedQuantity ?? 0,
    unitPrice: new Prisma.Decimal(item.unitPrice ?? '12000000'),
    costSnapshot: new Prisma.Decimal('10000000'),
    costCurrency: Currency.UZS,
    suggestedPriceSnapshot: null,
    product: { id: 'product-1', displayName: 'Apple iPhone 15 Pro' },
  }));

  const payments = (options.payments ?? [{}]).map((payment, index) => ({
    id: payment.id ?? `payment-${String(index + 1)}`,
    status: payment.status ?? PaymentStatus.CONFIRMED,
    method: PaymentMethod.CASH,
    paidAmount: new Prisma.Decimal(payment.paidAmount ?? '12000000'),
    paidCurrency: payment.paidCurrency ?? Currency.UZS,
    appliedAmount: new Prisma.Decimal(payment.appliedAmount ?? '12000000'),
    appliedCurrency: Currency.UZS,
    exchangeRate: RATE,
    cashAccountId: payment.cashAccountId === undefined ? ACCOUNT_ID : payment.cashAccountId,
    cashAccount: { id: ACCOUNT_ID, name: 'Naqd UZS' },
    paidAt: SOLD_AT,
    confirmedAt: SOLD_AT,
  }));

  const sale = {
    id: 'sale-1',
    number: '2026-00147',
    kind: SaleKind.CASH,
    status: options.status ?? SaleStatus.CONFIRMED,
    currency: Currency.UZS,
    exchangeRate: RATE,
    total: new Prisma.Decimal('12000000'),
    soldAt: options.soldAt ?? new Date(Date.now() - 86_400_000),
    confirmedAt: SOLD_AT,
    customerId: null,
    customer: null,
    reversesSaleId: null,
    reversalKind: null,
    reversalReason: null,
    reversalNote: null,
    createdAt: SOLD_AT,
    updatedAt: SOLD_AT,
    items,
    payments,
    // Teskari qatorlar ham `sales` qatori, ya'ni mapper ular ustidan
    // to'liq yuradi — qisqartirilgan dublyor `toString` da qulardi
    reversals: Array.from({ length: options.reversalCount ?? 0 }, (_, index) => ({
      id: `reversal-${String(index + 1)}`,
      number: `2026-00147-R${String(index + 1)}`,
      kind: SaleKind.CASH,
      status: SaleStatus.REVERSAL,
      currency: Currency.UZS,
      total: new Prisma.Decimal('-12000000'),
      soldAt: SOLD_AT,
      customerId: null,
      customer: null,
      reversesSaleId: 'sale-1',
      reversalKind: ReversalKind.RETURN,
      _count: { items: 1 },
    })),
  };

  const created: Record<string, unknown>[] = [];
  const movements: Record<string, unknown>[] = [];
  const cashOut: Record<string, unknown>[] = [];
  const itemUpdates: { id: string; data: Record<string, unknown> }[] = [];
  const saleUpdates: Record<string, unknown>[] = [];
  const paymentUpdates: { id: string; data: Record<string, unknown> }[] = [];
  const inventoryUpdates: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];
  const batchUpdates: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];
  const contractUpdates: Record<string, unknown>[] = [];
  const debtReductions: { amount: string }[] = [];

  const tx = {
    sale: {
      findUnique: vi.fn(() => Promise.resolve(sale)),
      findUniqueOrThrow: vi.fn(() => Promise.resolve(sale)),
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        created.push(args.data);
        return Promise.resolve({ id: 'reversal-1', ...args.data });
      }),
      update: vi.fn((args: { data: Record<string, unknown> }) => {
        saleUpdates.push(args.data);
        return Promise.resolve({ ...sale, ...args.data });
      }),
    },
    saleItem: {
      update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
        itemUpdates.push({ id: args.where.id, data: args.data });
        return Promise.resolve({});
      }),
    },
    inventoryItem: {
      updateMany: vi.fn(
        (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          inventoryUpdates.push(args);
          return Promise.resolve({ count: options.restockCount ?? 1 });
        },
      ),
    },
    inventoryBatch: {
      update: vi.fn((args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        batchUpdates.push(args);
        return Promise.resolve({});
      }),
    },
    stockMovement: {
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        movements.push(args.data);
        return Promise.resolve({});
      }),
    },
    payment: {
      update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
        paymentUpdates.push({ id: args.where.id, data: args.data });
        return Promise.resolve({});
      }),
    },
    /**
     * Shu to'lovdan ILGARI qaytarilgan pul (§11.1). Dublyor uni
     * fiksturadan oladi: aynan shu qiymat ikkinchi qisman qaytarishning
     * chegarasini belgilaydi.
     */
    cashEntry: {
      aggregate: vi.fn((args: { where: { paymentId: string } }) =>
        Promise.resolve({
          _sum: {
            amount: new Prisma.Decimal(options.alreadyRefunded?.[args.where.paymentId] ?? '0'),
          },
        }),
      ),
    },
    installmentContract: {
      findUnique: vi.fn(() =>
        Promise.resolve(
          options.contract
            ? {
                ...options.contract,
                currency: Currency.UZS,
                cashPrice: new Prisma.Decimal(options.contract.cashPrice ?? '12000000'),
                markupAmount: new Prisma.Decimal(options.contract.markupAmount ?? '0'),
              }
            : null,
        ),
      ),
      update: vi.fn((args: { data: Record<string, unknown> }) => {
        contractUpdates.push(args.data);
        return Promise.resolve({});
      }),
    },
  };

  const prisma = {
    $transaction: vi.fn((handler: (client: unknown) => Promise<unknown>) => handler(tx)),
  };
  const cash = {
    createReversal: vi.fn((_tx: unknown, params: Record<string, unknown>) => {
      cashOut.push(params);
      return Promise.resolve();
    }),
  };
  // Parametrlar ataylab e'lon qilingan: auditga NIMA yozilgani
  // tekshiriladi (§8.6 sababni talab qiladi), imzosiz mock'da esa
  // `mock.calls[0]` bo'sh kortej bo'lib qolardi
  const audit = {
    record: vi.fn(
      (_tx: unknown, _shopId: string | null, _entry: { action: string; after: unknown }) =>
        Promise.resolve(),
    ),
  };
  const config = { get: vi.fn(() => 'Asia/Tashkent') };

  /**
   * §16.12 — qarzni kamaytirish `AllocationService` da (jadval keshini
   * biladigan yagona joy). Bu yerda uning CHAQIRILGANI va qanday summa
   * bilan chaqirilgani tekshiriladi; kamaytirishning o'zi
   * `allocation.service.spec.ts` da sinaladi.
   */
  const allocation = {
    reduceDebt: vi.fn((_tx: unknown, params: { amount: string }) => {
      debtReductions.push(params);
      return Promise.resolve({ reduced: params.amount, unabsorbed: '0' });
    }),
  };

  const service = new SaleReversalService(
    prisma as never,
    cash as never,
    allocation as never,
    audit as never,
    config as never,
  );

  return {
    service,
    sale,
    created,
    movements,
    cashOut,
    itemUpdates,
    saleUpdates,
    paymentUpdates,
    inventoryUpdates,
    batchUpdates,
    contractUpdates,
    debtReductions,
    allocation,
    audit,
  };
}

/**
 * Yozuv amallari Shop konteksti ICHIDA chaqiriladi — ishlab chiqarishda
 * `ShopContextInterceptor` shuni qiladi (`product.service.spec.ts` va
 * `sale-confirmation.service.spec.ts` bilan bir xil usul).
 */
function returnScoped(
  service: SaleReversalService,
  ...args: Parameters<SaleReversalService['returnSale']>
): ReturnType<SaleReversalService['returnSale']> {
  return runWithShopScope(SHOP_ID, () => service.returnSale(...args));
}

function cancelScoped(
  service: SaleReversalService,
  ...args: Parameters<SaleReversalService['cancel']>
): ReturnType<SaleReversalService['cancel']> {
  return runWithShopScope(SHOP_ID, () => service.cancel(...args));
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

const REASON = { reason: ReversalReason.DEFECTIVE, note: null };

describe('SaleReversalService', () => {
  describe('qaytarish (§8)', () => {
    it('teskari qator asl kursda va manfiy summa bilan yoziladi (§8.1, §17.4)', async () => {
      const { service, created } = makeService();

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );

      const reversal = created[0];
      expect(reversal?.status).toBe(SaleStatus.REVERSAL);
      expect(reversal?.reversalKind).toBe(ReversalKind.RETURN);
      // Asl kurs — bugungisi emas, aks holda savdo nolga chiqmasdi
      expect(reversal?.exchangeRate).toBe(RATE);
      expect((reversal?.total as Prisma.Decimal).toString()).toBe('-12000000');
      expect(reversal?.reversesSaleId).toBe('sale-1');
    });

    it('raqam asl raqamdan hosil bo‘ladi: -R1, keyin -R2 (§17.4)', async () => {
      const first = makeService();
      await returnScoped(
        first.service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );
      expect(first.created[0]?.number).toBe('2026-00147-R1');

      const second = makeService({
        items: [{ id: 'item-1', quantity: 2 }],
        reversalCount: 1,
      });
      await returnScoped(
        second.service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );
      expect(second.created[0]?.number).toBe('2026-00147-R2');
    });

    it('§8.7 — qaytarish O‘Z sanasiga yoziladi, savdo sanasiga emas', async () => {
      const soldAt = new Date(Date.now() - 3 * 86_400_000);
      const { service, created } = makeService({ soldAt });

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );

      const writtenAt = created[0]?.soldAt as Date;
      expect(writtenAt.getTime()).toBeGreaterThan(soldAt.getTime());
      expect(Date.now() - writtenAt.getTime()).toBeLessThan(5000);
    });

    it('§8.2 — seriyali birlik RETURNED holatda va sabab bilan qaytadi', async () => {
      const { service, inventoryUpdates } = makeService();

      await returnScoped(
        service,
        'sale-1',
        {
          reason: ReversalReason.DEFECTIVE,
          note: 'Ekran nuqsonli',
          items: [{ saleItemId: 'item-1', quantity: 1 }],
        },
        ACTOR,
        null,
      );

      const update = inventoryUpdates[0];
      // Shartli `UPDATE`: faqat SOLD holatdagi birlik qaytadi (§17.5 naqshi)
      expect(update?.where).toMatchObject({ status: InventoryStatus.SOLD });
      expect(update?.data).toMatchObject({ status: InventoryStatus.RETURNED });
      expect(String(update?.data.returnReason)).toContain('Ekran nuqsonli');
    });

    it('ombor birligi boshqa holatda — poyga ushlanadi', async () => {
      const { service } = makeService({ restockCount: 0 });

      await expectAppException(
        returnScoped(
          service,
          'sale-1',
          { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
          ACTOR,
          null,
        ),
        ErrorCode.SALE_ITEM_NOT_AVAILABLE,
      );
    });

    it('miqdorli mahsulotda partiya qoldig‘i oshadi', async () => {
      const { service, batchUpdates } = makeService({
        items: [
          {
            id: 'item-1',
            quantity: 5,
            inventoryItemId: null,
            batchId: 'batch-1',
            unitPrice: '50000',
          },
        ],
      });

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 2 }] },
        ACTOR,
        null,
      );

      expect(batchUpdates[0]?.data).toEqual({ quantityRemaining: { increment: 2 } });
    });

    it('§8.4 — qisman qaytarishda savdo PARTIALLY_RETURNED bo‘ladi', async () => {
      const { service, saleUpdates, itemUpdates } = makeService({
        items: [{ id: 'item-1', quantity: 3, inventoryItemId: null, batchId: 'batch-1' }],
      });

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );

      expect(saleUpdates[0]?.status).toBe(SaleStatus.PARTIALLY_RETURNED);
      expect(itemUpdates[0]).toEqual({
        id: 'item-1',
        data: { returnedQuantity: { increment: 1 } },
      });
    });

    it('hamma qator qaytsa — RETURNED', async () => {
      const { service, saleUpdates } = makeService({
        items: [
          {
            id: 'item-1',
            quantity: 3,
            returnedQuantity: 2,
            inventoryItemId: null,
            batchId: 'batch-1',
          },
        ],
      });

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );

      expect(saleUpdates[0]?.status).toBe(SaleStatus.RETURNED);
    });

    it('qolgan miqdordan ortiq qaytarilmaydi', async () => {
      const { service } = makeService({
        items: [
          {
            id: 'item-1',
            quantity: 3,
            returnedQuantity: 2,
            inventoryItemId: null,
            batchId: 'batch-1',
          },
        ],
      });

      const error = await expectAppException(
        returnScoped(
          service,
          'sale-1',
          { ...REASON, items: [{ saleItemId: 'item-1', quantity: 2 }] },
          ACTOR,
          null,
        ),
        ErrorCode.VALIDATION_FAILED,
      );
      expect(error.details).toMatchObject({ remaining: 1 });
    });

    it('bitta qator ikki marta yuborilsa rad etiladi', async () => {
      const { service } = makeService({
        items: [{ id: 'item-1', quantity: 2, inventoryItemId: null, batchId: 'batch-1' }],
      });

      await expectAppException(
        returnScoped(
          service,
          'sale-1',
          {
            ...REASON,
            items: [
              { saleItemId: 'item-1', quantity: 1 },
              { saleItemId: 'item-1', quantity: 1 },
            ],
          },
          ACTOR,
          null,
        ),
        ErrorCode.VALIDATION_FAILED,
      );
    });

    it('boshqa savdoning qatori qaytarilmaydi', async () => {
      const { service } = makeService();

      await expectAppException(
        returnScoped(
          service,
          'sale-1',
          { ...REASON, items: [{ saleItemId: 'begona', quantity: 1 }] },
          ACTOR,
          null,
        ),
        ErrorCode.NOT_FOUND,
      );
    });

    it('allaqachon to‘liq qaytarilgan savdo qayta qaytarilmaydi', async () => {
      const { service } = makeService({ status: SaleStatus.RETURNED });

      await expectAppException(
        returnScoped(
          service,
          'sale-1',
          { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
          ACTOR,
          null,
        ),
        ErrorCode.SALE_ALREADY_RETURNED,
      );
    });

    it('qoralama qaytarilmaydi — o‘chirish kerak', async () => {
      const { service } = makeService({ status: SaleStatus.DRAFT });

      await expectAppException(
        returnScoped(
          service,
          'sale-1',
          { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
          ACTOR,
          null,
        ),
        ErrorCode.SALE_NOT_DRAFT,
      );
    });

    it('ombor harakati RETURN turida va teskari qatorga bog‘lanadi (§5.10)', async () => {
      const { service, movements } = makeService();

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );

      expect(movements[0]).toMatchObject({
        type: StockMovementType.RETURN,
        quantity: 1,
        referenceType: 'SALE_REVERSAL',
        referenceId: 'reversal-1',
      });
    });
  });

  describe('pul (§11.7)', () => {
    it('to‘liq qaytarishda to‘lov REVERSED va kassadan aynan o‘sha summa chiqadi', async () => {
      const { service, cashOut, paymentUpdates } = makeService();

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );

      expect(cashOut).toHaveLength(1);
      expect(cashOut[0]).toMatchObject({
        accountId: ACCOUNT_ID,
        paymentId: 'payment-1',
        amount: '12000000',
        currency: Currency.UZS,
      });
      expect(paymentUpdates[0]).toEqual({
        id: 'payment-1',
        data: { status: PaymentStatus.REVERSED },
      });
    });

    it('qisman qaytarishda faqat qaytgan qism chiqadi, to‘lov CONFIRMED qoladi', async () => {
      const { service, cashOut, paymentUpdates } = makeService({
        items: [
          {
            id: 'item-1',
            quantity: 2,
            inventoryItemId: null,
            batchId: 'batch-1',
            unitPrice: '6000000',
          },
        ],
      });

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );

      expect(cashOut[0]).toMatchObject({ amount: '6000000' });
      expect(paymentUpdates).toHaveLength(0);
    });

    it('tasdiqlanmagan o‘tkazma kassadan chiqmaydi — u REJECTED bo‘ladi (§17.2)', async () => {
      const { service, cashOut, paymentUpdates } = makeService({
        payments: [{ id: 'payment-1', status: PaymentStatus.PENDING_VERIFICATION }],
      });

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );

      expect(cashOut).toHaveLength(0);
      expect(paymentUpdates[0]).toEqual({
        id: 'payment-1',
        data: { status: PaymentStatus.REJECTED },
      });
    });
  });

  describe('bekor qilish (§16.5)', () => {
    it('savdo ASL sanasiga yoziladi va status CANCELLED bo‘ladi', async () => {
      const soldAt = new Date(Date.now() - 2 * 86_400_000);
      const { service, created, saleUpdates } = makeService({ soldAt });

      await cancelScoped(
        service,
        'sale-1',
        { reason: ReversalReason.ENTRY_ERROR, note: null },
        ACTOR,
        null,
      );

      expect((created[0]?.soldAt as Date).getTime()).toBe(soldAt.getTime());
      expect(created[0]?.reversalKind).toBe(ReversalKind.CANCEL);
      expect(saleUpdates[0]?.status).toBe(SaleStatus.CANCELLED);
    });

    it('mahsulot to‘g‘ridan-to‘g‘ri AVAILABLE bo‘ladi, "qaytarilgan" belgisisiz', async () => {
      const { service, inventoryUpdates } = makeService();

      await cancelScoped(
        service,
        'sale-1',
        { reason: ReversalReason.ENTRY_ERROR, note: null },
        ACTOR,
        null,
      );

      expect(inventoryUpdates[0]?.data).toEqual({ status: InventoryStatus.AVAILABLE });
    });

    it('7 kundan eski savdo bekor qilinmaydi (§16.5)', async () => {
      const { service } = makeService({ soldAt: new Date(Date.now() - 8 * 86_400_000) });

      await expectAppException(
        cancelScoped(
          service,
          'sale-1',
          { reason: ReversalReason.ENTRY_ERROR, note: null },
          ACTOR,
          null,
        ),
        ErrorCode.SALE_CANCEL_WINDOW_EXPIRED,
      );
    });

    it('qisman qaytarilgan savdo bekor qilinmaydi', async () => {
      const { service } = makeService({ status: SaleStatus.PARTIALLY_RETURNED });

      await expectAppException(
        cancelScoped(
          service,
          'sale-1',
          { reason: ReversalReason.ENTRY_ERROR, note: null },
          ACTOR,
          null,
        ),
        ErrorCode.SALE_ALREADY_RETURNED,
      );
    });

    it('qatorlar tanlanmaydi — qolgan hammasi qaytadi', async () => {
      const { service, created } = makeService({
        items: [
          { id: 'item-1', quantity: 1, unitPrice: '12000000' },
          {
            id: 'item-2',
            quantity: 2,
            inventoryItemId: null,
            batchId: 'batch-1',
            unitPrice: '50000',
          },
        ],
      });

      await cancelScoped(
        service,
        'sale-1',
        { reason: ReversalReason.ENTRY_ERROR, note: null },
        ACTOR,
        null,
      );

      expect((created[0]?.total as Prisma.Decimal).toString()).toBe('-12100000');
    });
  });

  describe('audit (§8.6)', () => {
    it('sabab, izoh va qatorlar yoziladi', async () => {
      const { service, audit } = makeService();

      await returnScoped(
        service,
        'sale-1',
        {
          reason: ReversalReason.DEFECTIVE,
          note: 'Ekran',
          items: [{ saleItemId: 'item-1', quantity: 1 }],
        },
        ACTOR,
        null,
      );

      expect(audit.record).toHaveBeenCalledOnce();
      const entry = audit.record.mock.calls[0]?.[2] as {
        action: string;
        after: Record<string, unknown>;
      };
      expect(entry.action).toBe('SALE_RETURNED');
      expect(entry.after).toMatchObject({
        reason: ReversalReason.DEFECTIVE,
        note: 'Ekran',
        reversalNumber: '2026-00147-R1',
      });
    });
  });

  /**
   * Code-review topilmalari (2026-08-14). Har uchalasi ham jimgina
   * noto'g'ri pul yoki qarz qoldirardi va ilova ishlashda davom etardi.
   */
  describe('takroriy qisman qaytarish', () => {
    it('ilgari qaytarilgan pul hisobga olinadi — hisobdan ortiqcha chiqmaydi', async () => {
      // To'lov 600 000 bo'lgan hisobdan 500 000 allaqachon qaytgan:
      // ikkinchi qaytarishda undan faqat 100 000 qolgan
      const { service, cashOut } = makeService({
        items: [
          {
            id: 'item-1',
            quantity: 3,
            inventoryItemId: null,
            batchId: 'batch-1',
            unitPrice: '500000',
          },
        ],
        payments: [
          { id: 'payment-1', paidAmount: '600000', appliedAmount: '600000' },
          { id: 'payment-2', paidAmount: '900000', appliedAmount: '900000' },
        ],
        alreadyRefunded: { 'payment-1': '500000' },
      });

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );

      // 500 000 dan: 100 000 birinchi hisobdan (qolgani shu), 400 000 ikkinchisidan
      expect(cashOut).toEqual([
        expect.objectContaining({ paymentId: 'payment-1', amount: '100000' }),
        expect.objectContaining({ paymentId: 'payment-2', amount: '400000' }),
      ]);
    });

    it('puli butunlay qaytgan to‘lov REVERSED bo‘ladi', async () => {
      const { service, paymentUpdates } = makeService({
        items: [
          {
            id: 'item-1',
            quantity: 3,
            inventoryItemId: null,
            batchId: 'batch-1',
            unitPrice: '500000',
          },
        ],
        payments: [{ id: 'payment-1', paidAmount: '600000', appliedAmount: '600000' }],
        alreadyRefunded: { 'payment-1': '100000' },
      });

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );

      expect(paymentUpdates).toEqual([
        { id: 'payment-1', data: { status: PaymentStatus.REVERSED } },
      ]);
    });

    it('qisman qaytarishda kutilayotgan o‘tkazma RAD ETILMAYDI', async () => {
      const { service, paymentUpdates } = makeService({
        items: [
          {
            id: 'item-1',
            quantity: 3,
            inventoryItemId: null,
            batchId: 'batch-1',
            unitPrice: '500000',
          },
        ],
        payments: [{ id: 'payment-1', status: PaymentStatus.PENDING_VERIFICATION }],
      });

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );

      // Savdo hali kuchda — pul kelganda tasdiqlanadigan qator qolishi kerak
      expect(paymentUpdates).toHaveLength(0);
    });

    it('to‘liq qaytarishda kutilayotgan o‘tkazma rad etiladi', async () => {
      const { service, paymentUpdates } = makeService({
        payments: [{ id: 'payment-1', status: PaymentStatus.PENDING_VERIFICATION }],
      });

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );

      expect(paymentUpdates).toEqual([
        { id: 'payment-1', data: { status: PaymentStatus.REJECTED } },
      ]);
    });
  });

  /** §17.18 — savdo qaytarilsa/bekor qilinsa shartnoma BEKOR QILINGAN. */
  describe('nasiya shartnomasi (§17.18)', () => {
    it('to‘liq qaytarishda shartnoma bekor qilinadi', async () => {
      const { service, contractUpdates } = makeService({
        contract: { id: 'contract-1', status: ContractStatus.ACTIVE },
      });

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );

      expect(contractUpdates[0]).toMatchObject({ status: ContractStatus.CANCELLED });
    });

    it('bekor qilishda ham shartnoma bekor qilinadi', async () => {
      const { service, contractUpdates } = makeService({
        contract: { id: 'contract-1', status: ContractStatus.ACTIVE },
      });

      await cancelScoped(
        service,
        'sale-1',
        { reason: ReversalReason.ENTRY_ERROR, note: null },
        ACTOR,
        null,
      );

      expect(contractUpdates[0]).toMatchObject({ status: ContractStatus.CANCELLED });
    });

    /**
     * §16.12 — qisman qaytarilgan nasiyada qarz **qaytgan qatorlar
     * qiymati va unga tegishli proporsional ustama** miqdorida kamayadi.
     *
     * Ustama nega proporsional: u butun savdoga qo'yilgan (§9.3). Uni
     * to'liq qoldirish qaytarilgan mahsulot uchun ustama undirish
     * bo'lardi; butunlay olib tashlash esa qolgan mahsulot uchun
     * ustamani bekor qilardi.
     */
    it('qisman qaytarishda qarz qiymat + proporsional ustama miqdorida kamayadi', async () => {
      const { service, debtReductions, contractUpdates } = makeService({
        items: [
          {
            id: 'item-1',
            quantity: 3,
            inventoryItemId: null,
            batchId: 'batch-1',
            unitPrice: '4000000',
          },
        ],
        contract: {
          id: 'contract-1',
          status: ContractStatus.ACTIVE,
          cashPrice: '12000000',
          markupAmount: '2400000',
        },
      });

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );

      // Qaytgan qiymat 4 000 000 (12 000 000 ning uchdan biri),
      // ustama ulushi 2 400 000 / 3 = 800 000
      expect(debtReductions).toHaveLength(1);
      expect(debtReductions[0]).toMatchObject({ amount: '4800000' });
      // Qisman qaytarishda shartnoma BEKOR QILINMAYDI — savdoning
      // qolgan qismi kuchda
      expect(contractUpdates).toHaveLength(0);
    });

    it('ustamasiz shartnomada qarz faqat qiymat miqdorida kamayadi', async () => {
      const { service, debtReductions } = makeService({
        items: [
          {
            id: 'item-1',
            quantity: 2,
            inventoryItemId: null,
            batchId: 'batch-1',
            unitPrice: '6000000',
          },
        ],
        contract: { id: 'contract-1', status: ContractStatus.ACTIVE, markupAmount: '0' },
      });

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );

      expect(debtReductions).toHaveLength(1);
      expect(debtReductions[0]).toMatchObject({ amount: '6000000' });
    });

    /**
     * §8.5 — nasiyada to'langan pulni qaytarish/qaytarmaslikni EGA
     * qo'lda hal qiladi. Mijoz bir necha oy to'lagan bo'lishi mumkin va
     * bu summani nima qilish — muzokara masalasi, hisob-kitob emas.
     */
    it('nasiyada pul avtomatik qaytarilmaydi (§8.5)', async () => {
      const { service, cashOut, paymentUpdates } = makeService({
        contract: { id: 'contract-1', status: ContractStatus.ACTIVE },
      });

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );

      expect(cashOut).toHaveLength(0);
      expect(paymentUpdates).toHaveLength(0);
    });

    it('naqd savdoda esa pul o‘sha zahoti qaytadi', async () => {
      const { service, cashOut } = makeService();

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );

      expect(cashOut).toHaveLength(1);
    });

    it('shartnomasiz savdoda hech narsa o‘zgarmaydi', async () => {
      const { service, contractUpdates } = makeService();

      await returnScoped(
        service,
        'sale-1',
        { ...REASON, items: [{ saleItemId: 'item-1', quantity: 1 }] },
        ACTOR,
        null,
      );

      expect(contractUpdates).toHaveLength(0);
    });
  });
});
