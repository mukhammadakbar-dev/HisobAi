import { Currency, ErrorCode, ProductType } from '@hisobai/contracts';
import type { ReceiveInput } from '@hisobai/contracts';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuditEntry } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import type { RequestUser } from '../common/request-user';
import { InventoryReceivingService } from './inventory-receiving.service';

/**
 * Qabul qilish — bosqichning eng qimmat amali. Bu yerda tekshiriladigan
 * xulqlarning har biri jimgina buzilganda ombor bilan tarix bir-biriga
 * mos kelmay qoladi:
 *
 *  - §5.10 har birlik uchun `RECEIVE` harakati va ularning **bitta**
 *    `referenceId` bilan bog'lanishi;
 *  - §1.10 yaxlitlash **yozishdan oldin** (UZS butun, USD 2 xona);
 *  - §5.3 dublikat identifikator qator raqami bilan qaytadi — ustunlararo
 *    to'qnashuv ham (`A.imei_2` = yangi `imei_1`);
 *  - §16.9 valyuta mosligi va §4.2 `lastCostPrice`.
 */

const ACTOR = { id: 'user-1' } as RequestUser;
const RECEIVED_AT = '2026-08-11T09:00:00.000Z';

interface ExistingItem {
  id: string;
  imei1: string | null;
  imei2: string | null;
  serialNumber: string | null;
  status: string;
}

interface ProductFixture {
  id?: string;
  type?: string;
  currency?: string;
  isActive?: boolean;
}

function makeService(options: { product?: ProductFixture | null; existing?: ExistingItem[] } = {}) {
  const fixture = options.product === null ? null : { ...DEFAULT_PRODUCT, ...options.product };
  const existing = options.existing ?? [];

  const itemRows: Record<string, unknown>[] = [];
  const batchRows: Record<string, unknown>[] = [];
  const movementRows: Record<string, unknown>[] = [];
  const productUpdates: Record<string, unknown>[] = [];

  const audit = {
    record: vi.fn((_tx: unknown, _entry: AuditEntry) => Promise.resolve()),
    recordDetached: vi.fn((_entry: AuditEntry) => Promise.resolve()),
  };

  const summary = fixture
    ? {
        id: fixture.id,
        displayName: 'Apple iPhone 15 Pro 256GB Qora',
        type: fixture.type,
        currency: fixture.currency,
      }
    : null;

  const tx = {
    product: {
      findUnique: () => Promise.resolve(fixture),
      update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        productUpdates.push({ id: where.id, ...data });
        return Promise.resolve({});
      },
    },
    inventoryItem: {
      findMany: ({ where }: { where: { OR: Record<string, { in: string[] }>[] } }) => {
        const wanted = new Set(where.OR.flatMap((clause) => Object.values(clause)[0]?.in ?? []));
        return Promise.resolve(
          existing.filter((item) =>
            [item.imei1, item.imei2, item.serialNumber].some(
              (value) => value !== null && wanted.has(value),
            ),
          ),
        );
      },
      createManyAndReturn: ({ data }: { data: Record<string, unknown>[] }) => {
        const created = data.map((row, index) => ({
          ...row,
          id: `item-${String(itemRows.length + index + 1)}`,
          status: 'AVAILABLE',
          returnReason: null,
          updatedAt: new Date(RECEIVED_AT),
          product: summary,
        }));
        itemRows.push(...created);
        return Promise.resolve(created);
      },
    },
    inventoryBatch: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        const created = { ...data, id: `batch-${String(batchRows.length + 1)}`, product: summary };
        batchRows.push(created);
        return Promise.resolve(created);
      },
    },
    stockMovement: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        movementRows.push(data);
        return Promise.resolve(data);
      },
      createMany: ({ data }: { data: Record<string, unknown>[] }) => {
        movementRows.push(...data);
        return Promise.resolve({ count: data.length });
      },
    },
  };

  const prisma = {
    $transaction: <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
  };

  const service = new InventoryReceivingService(prisma as never, audit as never);
  return { service, audit, itemRows, batchRows, movementRows, productUpdates };
}

const DEFAULT_PRODUCT = {
  id: 'product-1',
  type: ProductType.SERIALIZED,
  currency: Currency.UZS,
  isActive: true,
};

function serializedInput(over: Partial<ReceiveInput> = {}): ReceiveInput {
  return {
    productId: 'product-1',
    costCurrency: Currency.UZS,
    receivedAt: RECEIVED_AT,
    items: [{ imei1: '353917104876543', costPrice: '12000000' }],
    ...over,
  } as ReceiveInput;
}

function batchInput(over: Partial<ReceiveInput> = {}): ReceiveInput {
  return {
    productId: 'product-1',
    costCurrency: Currency.UZS,
    receivedAt: RECEIVED_AT,
    batch: { quantityReceived: 10, unitCost: '25000' },
    ...over,
  } as ReceiveInput;
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

describe('InventoryReceivingService', () => {
  describe('seriyali birliklar (§5.1)', () => {
    it('birlik, harakat va lastCostPrice birga yoziladi', async () => {
      const { service, itemRows, movementRows, productUpdates, audit } = makeService();

      const result = await service.receive(
        serializedInput({
          items: [
            { imei1: '353917104876543', imei2: '353917104876551', costPrice: '12000000' },
            { serialNumber: 'SN-0001', costPrice: '11500000' },
          ],
        }),
        ACTOR,
        null,
      );

      expect(itemRows).toHaveLength(2);
      expect(movementRows).toHaveLength(2);
      expect(result.totalQuantity).toBe(2);
      expect(result.totalCost).toBe('23500000');
      // §4.2 — oxirgi qabuldagi tannarx formani oldindan to'ldiradi
      expect(productUpdates).toEqual([
        { id: 'product-1', lastCostPrice: new Prisma.Decimal('11500000') },
      ]);
      expect(audit.record).toHaveBeenCalledOnce();
    });

    it('§5.10 — barcha harakatlar bitta qabul bilan bog‘lanadi', async () => {
      const { service, movementRows } = makeService();

      const result = await service.receive(
        serializedInput({
          items: [
            { imei1: '353917104876543', costPrice: '1' },
            { imei1: '353917104876551', costPrice: '1' },
          ],
        }),
        ACTOR,
        null,
      );

      expect(movementRows.map((row) => row.referenceId)).toEqual([
        result.receiptId,
        result.receiptId,
      ]);
      expect(movementRows[0]).toMatchObject({
        type: 'RECEIVE',
        quantity: 1,
        referenceType: 'RECEIVE',
        actorId: ACTOR.id,
        occurredAt: new Date(RECEIVED_AT),
      });
    });

    it('§1.10 — UZS tannarxi yozishdan oldin butun songacha yaxlitlanadi', async () => {
      const { service, itemRows } = makeService();

      await service.receive(
        serializedInput({ items: [{ imei1: '353917104876543', costPrice: '12000000.6' }] }),
        ACTOR,
        null,
      );

      expect(itemRows[0]?.costPrice).toEqual(new Prisma.Decimal('12000001'));
    });

    it('§1.10 — USD tannarxi ikki kasr xonagacha (float xatosisiz)', async () => {
      const { service, itemRows } = makeService({
        product: { currency: Currency.USD },
      });

      const result = await service.receive(
        {
          ...serializedInput({ items: [{ imei1: '353917104876543', costPrice: '1.005' }] }),
          costCurrency: Currency.USD,
        },
        ACTOR,
        null,
      );

      // (1.005).toFixed(2) binar float'da '1.00' beradi — §17.14
      expect(itemRows[0]?.costPrice).toEqual(new Prisma.Decimal('1.01'));
      expect(result.totalCost).toBe('1.01');
    });

    it('USD jami valyuta miqyosini saqlaydi (ortiqcha nol tushib qolmaydi)', async () => {
      const { service } = makeService({ product: { currency: Currency.USD } });

      const result = await service.receive(
        {
          ...serializedInput({
            items: [
              { imei1: '353917104876543', costPrice: '1.00' },
              { imei1: '353917104876551', costPrice: '2.00' },
            ],
          }),
          costCurrency: Currency.USD,
        },
        ACTOR,
        null,
      );

      // `Decimal.toString()` bu yerda "3" berardi — forma esa `sumMoney`
      // bilan "3.00" ko'rsatadi va ikkovi ajralib ketardi (`API.md` §2.1)
      expect(result.totalCost).toBe('3.00');
    });

    it('miqdorli mahsulotga seriyali qabul yuborilsa rad etiladi', async () => {
      const { service } = makeService({ product: { type: ProductType.QUANTITY } });

      const error = await expectAppException(
        service.receive(serializedInput(), ACTOR, null),
        ErrorCode.INVENTORY_PRODUCT_TYPE_MISMATCH,
      );

      expect(error.field).toBe('items');
    });
  });

  describe('dublikat identifikator (§5.3, `API.md` §3.3)', () => {
    it('qator raqami, maydon va mavjud birlik holati bilan qaytadi', async () => {
      const { service, itemRows } = makeService({
        existing: [
          {
            id: 'item-old',
            imei1: '353917104876543',
            imei2: null,
            serialNumber: null,
            status: 'SOLD',
          },
        ],
      });

      const error = await expectAppException(
        service.receive(
          serializedInput({
            items: [
              { imei1: '353917104876551', costPrice: '1' },
              { imei1: '353917104876543', costPrice: '1' },
            ],
          }),
          ACTOR,
          null,
        ),
        ErrorCode.INVENTORY_DUPLICATE_IMEI,
      );

      expect(error.details?.rows).toEqual([
        {
          index: 1,
          field: 'imei1',
          value: '353917104876543',
          existingItemId: 'item-old',
          // Sotilgan telefonning IMEI'si ham band bo'lib qolaveradi
          existingStatus: 'SOLD',
        },
      ]);
      // Tranzaksiya to'liq bekor qilinadi — bittasi ham yozilmaydi
      expect(itemRows).toHaveLength(0);
    });

    it('ustunlararo to‘qnashuvni ham ushlaydi (mavjud imei_2 = yangi imei_1)', async () => {
      const { service } = makeService({
        existing: [
          {
            id: 'item-old',
            imei1: '353917104876500',
            imei2: '353917104876543',
            serialNumber: null,
            status: 'AVAILABLE',
          },
        ],
      });

      const error = await expectAppException(
        service.receive(serializedInput(), ACTOR, null),
        ErrorCode.INVENTORY_DUPLICATE_IMEI,
      );

      expect(error.details?.rows).toMatchObject([{ index: 0, field: 'imei1' }]);
    });
  });

  describe('partiya (§5.2)', () => {
    it('qoldiq kelgan miqdorga teng bo‘lib boshlanadi', async () => {
      const { service, batchRows, movementRows, productUpdates } = makeService({
        product: { type: ProductType.QUANTITY },
      });

      const result = await service.receive(batchInput(), ACTOR, null);

      expect(batchRows[0]).toMatchObject({
        quantityReceived: 10,
        quantityRemaining: 10,
        unitCost: new Prisma.Decimal('25000'),
      });
      expect(movementRows[0]).toMatchObject({ type: 'RECEIVE', quantity: 10 });
      expect(result.totalCost).toBe('250000');
      expect(productUpdates[0]).toMatchObject({ lastCostPrice: new Prisma.Decimal('25000') });
    });

    it('seriyali mahsulotga partiya yuborilsa rad etiladi', async () => {
      const { service } = makeService();

      const error = await expectAppException(
        service.receive(batchInput(), ACTOR, null),
        ErrorCode.INVENTORY_PRODUCT_TYPE_MISMATCH,
      );

      expect(error.field).toBe('batch');
    });
  });

  describe('mahsulot tekshiruvi', () => {
    it('§4.8 — arxivdagi mahsulotga qabul qilinmaydi', async () => {
      const { service } = makeService({ product: { isActive: false } });

      const error = await expectAppException(
        service.receive(serializedInput(), ACTOR, null),
        ErrorCode.CATALOG_PRODUCT_ARCHIVED,
      );

      expect(error.field).toBe('productId');
    });

    it('§16.9 — tannarx valyutasi mahsulotnikidan farq qilsa rad etiladi', async () => {
      const { service } = makeService();

      const error = await expectAppException(
        service.receive({ ...serializedInput(), costCurrency: Currency.USD }, ACTOR, null),
        ErrorCode.INVENTORY_COST_CURRENCY_MISMATCH,
      );

      expect(error.field).toBe('costCurrency');
      expect(error.details).toMatchObject({ productCurrency: Currency.UZS });
    });

    it('mahsulot topilmasa maydonga bog‘langan xato qaytadi', async () => {
      const { service } = makeService({ product: null });

      const error = await expectAppException(
        service.receive(serializedInput(), ACTOR, null),
        ErrorCode.NOT_FOUND,
      );

      expect(error.field).toBe('productId');
    });
  });
});
