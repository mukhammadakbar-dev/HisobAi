import { Currency, ErrorCode, ProductType } from '@hisobai/contracts';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { AuditEntry } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { readPrecondition } from '../common/optimistic-lock';
import type { RequestUser } from '../common/request-user';
import { ProductService } from './product.service';

/**
 * Mahsulot servisining jimgina buziladigan xulqlari:
 *
 *  - §4.6 nom serverda yig'iladi va brend/model o'zgarganda **qayta**
 *    yig'iladi — bo'lmasa qidiruv eski nom bo'yicha ishlab qoladi;
 *  - dublikat nom to'siladi — bo'lmasa bitta telefon ikkita shablonga
 *    bo'linib, qoldiq ham, foyda ham noto'g'ri chiqadi;
 *  - ombor bo'sh emas ekan `currency` va `type` qotadi — aks holda
 *    mavjud tannarx qatorlari jimgina boshqa valyutada o'qilardi;
 *  - §3.8 chegara: mahsulotniki, u yo'q bo'lsa sozlamalardagi.
 */

const ACTOR = { id: 'user-1' } as RequestUser;
const UPDATED_AT = new Date('2026-08-11T09:30:00.123Z');
const SETTINGS_THRESHOLD = 3;

interface TaxonomyRecord {
  id: string;
  name: string;
  isActive: boolean;
}

interface ProductRecord {
  id: string;
  categoryId: string;
  brandId: string;
  model: string;
  storage: string | null;
  color: string | null;
  displayName: string;
  type: string;
  currency: string;
  suggestedPrice: Prisma.Decimal | null;
  lastCostPrice: Prisma.Decimal | null;
  lowStockThreshold: number | null;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface StockFixture {
  /** `AVAILABLE` seriyali birliklar soni. */
  available?: number;
  /** Har qanday holatdagi birliklar (valyuta qulfi uchun). */
  itemsTotal?: number;
  /** Partiya qoldig'i yig'indisi. */
  batchRemaining?: number;
  batchCount?: number;
}

function product(over: Partial<ProductRecord> & { id: string }): ProductRecord {
  return {
    categoryId: 'cat-1',
    brandId: 'brand-1',
    model: 'iPhone 15 Pro',
    storage: '256GB',
    color: 'Qora',
    displayName: 'Apple iPhone 15 Pro 256GB Qora',
    type: ProductType.SERIALIZED,
    currency: Currency.UZS,
    suggestedPrice: null,
    lastCostPrice: null,
    lowStockThreshold: null,
    description: null,
    isActive: true,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: UPDATED_AT,
    ...over,
  };
}

function makeService(
  options: {
    products?: ProductRecord[];
    brands?: TaxonomyRecord[];
    categories?: TaxonomyRecord[];
    stock?: Record<string, StockFixture>;
  } = {},
) {
  const products = new Map((options.products ?? []).map((row) => [row.id, row]));
  const brands = new Map(
    (options.brands ?? [{ id: 'brand-1', name: 'Apple', isActive: true }]).map((row) => [
      row.id,
      row,
    ]),
  );
  const categories = new Map(
    (options.categories ?? [{ id: 'cat-1', name: 'Telefon', isActive: true }]).map((row) => [
      row.id,
      row,
    ]),
  );
  const stock = options.stock ?? {};
  const locks: string[] = [];

  const audit = {
    record: vi.fn((_tx: unknown, _entry: AuditEntry) => Promise.resolve()),
    recordDetached: vi.fn((_entry: AuditEntry) => Promise.resolve()),
  };
  const settings = { get: () => Promise.resolve({ lowStockThreshold: SETTINGS_THRESHOLD }) };

  const hydrate = (row: ProductRecord) => ({
    ...row,
    category: { id: row.categoryId, name: categories.get(row.categoryId)?.name ?? '—' },
    brand: { id: row.brandId, name: brands.get(row.brandId)?.name ?? '—' },
  });

  const productDelegate = {
    findMany: ({ where, take }: { where?: { isActive?: boolean }; take?: number }) => {
      let rows = [...products.values()];
      if (where?.isActive !== undefined)
        rows = rows.filter((row) => row.isActive === where.isActive);
      rows.sort((left, right) => left.displayName.localeCompare(right.displayName));
      return Promise.resolve(rows.slice(0, take).map(hydrate));
    },
    findUnique: ({ where }: { where: { id: string } }) => {
      const found = products.get(where.id);
      return Promise.resolve(found ? hydrate(found) : null);
    },
    findFirst: ({
      where,
    }: {
      where: { displayName?: { equals: string }; id?: { not: string } };
    }) => {
      const wanted = where.displayName?.equals.toLowerCase();
      const found = [...products.values()].find(
        (row) => row.displayName.toLowerCase() === wanted && (!where.id || row.id !== where.id.not),
      );
      return Promise.resolve(found ? { id: found.id, isActive: found.isActive } : null);
    },
    create: ({ data }: { data: Record<string, unknown> }) => {
      const created = product({
        id: `product-${String(products.size + 1)}`,
        ...(data as Partial<ProductRecord>),
      });
      products.set(created.id, created);
      return Promise.resolve(hydrate(created));
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string; updatedAt?: Date | { lte: Date } };
      data: Record<string, unknown>;
    }) => {
      const current = products.get(where.id);
      if (!current) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('yo‘q', {
            code: 'P2025',
            clientVersion: 'test',
          }),
        );
      }
      if (
        where.updatedAt instanceof Date &&
        where.updatedAt.getTime() !== current.updatedAt.getTime()
      ) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('eskirgan', {
            code: 'P2025',
            clientVersion: 'test',
          }),
        );
      }
      const updated: ProductRecord = {
        ...current,
        ...(data as Partial<ProductRecord>),
        updatedAt: new Date(current.updatedAt.getTime() + 1000),
      };
      products.set(updated.id, updated);
      return Promise.resolve(hydrate(updated));
    },
  };

  const taxonomyDelegate = (store: Map<string, TaxonomyRecord>) => ({
    findUnique: ({ where }: { where: { id: string } }) =>
      Promise.resolve(store.get(where.id) ?? null),
  });

  const client = {
    product: productDelegate,
    category: taxonomyDelegate(categories),
    brand: taxonomyDelegate(brands),
    inventoryItem: {
      groupBy: ({ where }: { where: { productId: { in: string[] } } }) =>
        Promise.resolve(
          where.productId.in
            .filter((id) => (stock[id]?.available ?? 0) > 0)
            .map((id) => ({ productId: id, _count: { _all: stock[id]?.available ?? 0 } })),
        ),
      count: ({ where }: { where: { productId: string } }) =>
        Promise.resolve(stock[where.productId]?.itemsTotal ?? 0),
    },
    inventoryBatch: {
      groupBy: ({ where }: { where: { productId: { in: string[] } } }) =>
        Promise.resolve(
          where.productId.in
            .filter((id) => (stock[id]?.batchRemaining ?? 0) > 0)
            .map((id) => ({
              productId: id,
              _sum: { quantityRemaining: stock[id]?.batchRemaining ?? 0 },
            })),
        ),
      count: ({ where }: { where: { productId: string } }) =>
        Promise.resolve(stock[where.productId]?.batchCount ?? 0),
    },
    // Advisory lock — chaqirilgani tekshiriladi, natijasi kerak emas.
    // `$executeRaw`: `pg_advisory_xact_lock` `void` qaytaradi va uni
    // `$queryRaw` bilan o'qib bo'lmaydi (jonli tekshiruvda aniqlangan).
    $executeRaw: (_strings: TemplateStringsArray, ...values: unknown[]) => {
      locks.push(String(values[0]));
      return Promise.resolve(0);
    },
  };

  const prisma = {
    ...client,
    $transaction: <T>(fn: (tx: typeof client) => Promise<T>) => fn(client),
  };

  const service = new ProductService(prisma as never, audit as never, settings as never);
  return { service, products, audit, locks };
}

/** `PATCH` uchun qulf tokeni (`API.md` §8). */
function precondition(expected: Date = UPDATED_AT) {
  return readPrecondition({ headers: {} } as Request, expected.toISOString());
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
  categoryId: 'cat-1',
  brandId: 'brand-1',
  model: 'iPhone 15 Pro',
  storage: '256GB',
  color: 'Qora',
  type: ProductType.SERIALIZED,
  currency: Currency.UZS,
  suggestedPrice: null,
  lowStockThreshold: null,
  description: null,
} as const;

describe('ProductService', () => {
  describe('yaratish', () => {
    it('§4.6 — nomni serverda yig‘adi', async () => {
      const { service } = makeService();

      const created = await service.create({ ...CREATE_INPUT }, ACTOR, null);

      expect(created.displayName).toBe('Apple iPhone 15 Pro 256GB Qora');
      expect(created.brandName).toBe('Apple');
      expect(created.categoryName).toBe('Telefon');
    });

    it('§4.7 — aksessuarda xotira va rang tushib qoladi', async () => {
      const { service } = makeService();

      const created = await service.create(
        { ...CREATE_INPUT, model: 'Kabel USB-C', storage: null, color: null },
        ACTOR,
        null,
      );

      expect(created.displayName).toBe('Apple Kabel USB-C');
    });

    it('dublikat nomni to‘sadi — registr farqi bilan ham', async () => {
      const { service } = makeService({
        products: [product({ id: 'p-1', displayName: 'apple iphone 15 pro 256gb qora' })],
      });

      const error = await expectAppException(
        service.create({ ...CREATE_INPUT }, ACTOR, null),
        ErrorCode.CATALOG_DUPLICATE_NAME,
      );

      expect(error.details).toMatchObject({ existingId: 'p-1', isActive: true });
    });

    it('dublikat tekshiruvidan oldin nom bo‘yicha qulf oladi (§17.5 poygasi)', async () => {
      const { service, locks } = makeService();

      await service.create({ ...CREATE_INPUT }, ACTOR, null);

      expect(locks).toEqual(['apple iphone 15 pro 256gb qora']);
    });

    it('arxivdagi brendga yangi mahsulot yaratilmaydi', async () => {
      const { service } = makeService({
        brands: [{ id: 'brand-1', name: 'Aplle', isActive: false }],
      });

      const error = await expectAppException(
        service.create({ ...CREATE_INPUT }, ACTOR, null),
        ErrorCode.CATALOG_TAXONOMY_ARCHIVED,
      );

      expect(error.field).toBe('brandId');
    });

    it('mavjud bo‘lmagan kategoriya — maydonga bog‘langan xato', async () => {
      const { service } = makeService();

      const error = await expectAppException(
        service.create({ ...CREATE_INPUT, categoryId: 'cat-yoq' }, ACTOR, null),
        ErrorCode.NOT_FOUND,
      );

      expect(error.field).toBe('categoryId');
    });

    it('tavsiya narxi Decimal bo‘lib yoziladi, DTO‘da satr bo‘lib qaytadi', async () => {
      const { service, products } = makeService();

      const created = await service.create(
        { ...CREATE_INPUT, suggestedPrice: '12500000' },
        ACTOR,
        null,
      );

      expect(created.suggestedPrice).toBe('12500000');
      expect(products.get(created.id)?.suggestedPrice).toBeInstanceOf(Prisma.Decimal);
    });
  });

  describe('tahrirlash', () => {
    it('§4.6 — model o‘zgarsa nom qayta yig‘iladi', async () => {
      const { service } = makeService({ products: [product({ id: 'p-1' })] });

      const updated = await service.update(
        'p-1',
        { model: 'iPhone 15 Pro Max' },
        precondition(),
        ACTOR,
        null,
      );

      expect(updated.displayName).toBe('Apple iPhone 15 Pro Max 256GB Qora');
    });

    it('rangni null qilish nomdan olib tashlaydi', async () => {
      const { service } = makeService({ products: [product({ id: 'p-1' })] });

      const updated = await service.update('p-1', { color: null }, precondition(), ACTOR, null);

      expect(updated.displayName).toBe('Apple iPhone 15 Pro 256GB');
    });

    it('arxivdagi brend o‘zgarmasa tahrirlashga xalaqit bermaydi', async () => {
      const { service } = makeService({
        products: [product({ id: 'p-1' })],
        brands: [{ id: 'brand-1', name: 'Apple', isActive: false }],
      });

      const updated = await service.update('p-1', { color: 'Oq' }, precondition(), ACTOR, null);

      expect(updated.displayName).toBe('Apple iPhone 15 Pro 256GB Oq');
    });

    it('ombor bo‘sh emas — valyuta qotadi', async () => {
      const { service } = makeService({
        products: [product({ id: 'p-1' })],
        stock: { 'p-1': { itemsTotal: 2 } },
      });

      const error = await expectAppException(
        service.update('p-1', { currency: Currency.USD }, precondition(), ACTOR, null),
        ErrorCode.CATALOG_PRODUCT_HAS_STOCK,
      );

      expect(error.field).toBe('currency');
    });

    it('ombor bo‘sh — valyutani o‘zgartirish mumkin', async () => {
      const { service } = makeService({ products: [product({ id: 'p-1' })] });

      const updated = await service.update(
        'p-1',
        { currency: Currency.USD },
        precondition(),
        ACTOR,
        null,
      );

      expect(updated.currency).toBe(Currency.USD);
    });

    it('eskirgan qulf tokeni — STALE_RESOURCE', async () => {
      const { service } = makeService({ products: [product({ id: 'p-1' })] });

      await expectAppException(
        service.update(
          'p-1',
          { color: 'Oq' },
          precondition(new Date('2026-08-01T00:00:00.000Z')),
          ACTOR,
          null,
        ),
        ErrorCode.STALE_RESOURCE,
      );
    });

    it('§4.8 — arxivlash o‘chirish o‘rniga', async () => {
      const { service, products, audit } = makeService({ products: [product({ id: 'p-1' })] });

      const updated = await service.update('p-1', { isActive: false }, precondition(), ACTOR, null);

      expect(updated.isActive).toBe(false);
      expect(products.has('p-1')).toBe(true);
      expect(audit.record).toHaveBeenCalledOnce();
    });

    it('nom o‘zgarmasa boshqa yozuv bilan to‘qnashuv tekshirilmaydi', async () => {
      const { service, locks } = makeService({ products: [product({ id: 'p-1' })] });

      await service.update('p-1', { description: 'Yangi' }, precondition(), ACTOR, null);

      expect(locks).toEqual([]);
    });
  });

  describe('qoldiq (§3.8)', () => {
    it('seriyalida faqat AVAILABLE birliklar sanaladi', async () => {
      const { service } = makeService({
        products: [product({ id: 'p-1' })],
        stock: { 'p-1': { available: 5, itemsTotal: 9 } },
      });

      const dto = await service.requireById('p-1');

      expect(dto.stock).toEqual({ available: 5, isLowStock: false });
    });

    it('miqdorlida partiya qoldiqlari qo‘shiladi', async () => {
      const { service } = makeService({
        products: [product({ id: 'p-1', type: ProductType.QUANTITY })],
        stock: { 'p-1': { batchRemaining: 12 } },
      });

      const dto = await service.requireById('p-1');

      expect(dto.stock.available).toBe(12);
    });

    it('mahsulot chegarasi bo‘lmasa sozlamalardagi chegara ishlatiladi', async () => {
      const { service } = makeService({
        products: [product({ id: 'p-1' })],
        stock: { 'p-1': { available: SETTINGS_THRESHOLD } },
      });

      const dto = await service.requireById('p-1');

      expect(dto.stock.isLowStock).toBe(true);
    });

    it('mahsulotning o‘z chegarasi umumiy chegaradan ustun turadi', async () => {
      const { service } = makeService({
        products: [product({ id: 'p-1', lowStockThreshold: 1 })],
        stock: { 'p-1': { available: 2 } },
      });

      const dto = await service.requireById('p-1');

      expect(dto.stock.isLowStock).toBe(false);
    });
  });
});
