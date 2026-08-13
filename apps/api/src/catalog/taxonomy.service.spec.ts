import { ErrorCode } from '@hisobai/contracts';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditEntry } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { readPrecondition } from '../common/optimistic-lock';
import type { RequestUser } from '../common/request-user';
import { TaxonomyService, type TaxonomyKind } from './taxonomy.service';

/**
 * Bu servisning uchta xulqi jimgina buziladi:
 *
 *  - §4.3 slug to'qnashuvi — ushlanmasa `500` chiqadi va foydalanuvchi
 *    "nima bo'ldi" degan savolsiz qoladi;
 *  - §4.6 nom qayta yig'ilishi — bo'lmasa brend tuzatilgandan keyin
 *    mahsulot nomlari eski holida qolib, qidiruvda topilmaydi;
 *  - slug bo'shatilishi — bo'lmasa arxivdagi yozuv nomni abadiy
 *    garovda ushlaydi va uni qayta yaratib bo'lmaydi.
 */

const ACTOR = { id: 'user-1' } as RequestUser;
const UPDATED_AT = new Date('2026-08-10T09:30:00.123Z');

interface Row {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ProductRow {
  id: string;
  brandId: string;
  categoryId: string;
  model: string;
  storage: string | null;
  color: string | null;
  displayName: string;
}

function row(over: Partial<Row> & { id: string; name: string; slug: string }): Row {
  return {
    isActive: true,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: UPDATED_AT,
    ...over,
  };
}

function makeService(
  options: { brands?: Row[]; categories?: Row[]; products?: ProductRow[] } = {},
) {
  const store: Record<TaxonomyKind, Map<string, Row>> = {
    brand: new Map((options.brands ?? []).map((r) => [r.id, r])),
    category: new Map((options.categories ?? []).map((r) => [r.id, r])),
  };
  const products = new Map((options.products ?? []).map((p) => [p.id, p]));
  const audit = {
    record: vi.fn((_tx: unknown, _shopId: string | null, _entry: AuditEntry) => Promise.resolve()),
    recordDetached: vi.fn((_shopId: string | null, _entry: AuditEntry) => Promise.resolve()),
  };

  const withCount = (r: Row) => ({
    ...r,
    _count: {
      products: [...products.values()].filter((p) => p.brandId === r.id || p.categoryId === r.id)
        .length,
    },
  });

  const delegateFor = (kind: TaxonomyKind) => ({
    findMany: ({ where, take }: { where?: { isActive?: boolean }; take?: number }) => {
      let rows = [...store[kind].values()];
      if (where?.isActive !== undefined) rows = rows.filter((r) => r.isActive === where.isActive);
      rows.sort((a, b) => a.name.localeCompare(b.name));
      return Promise.resolve(rows.slice(0, take).map(withCount));
    },
    findUnique: ({ where }: { where: { id?: string; slug?: string } }) => {
      const found = where.id
        ? store[kind].get(where.id)
        : [...store[kind].values()].find((r) => r.slug === where.slug);
      return Promise.resolve(found ? withCount(found) : null);
    },
    findUniqueOrThrow: ({ where }: { where: { id: string } }) => {
      const found = store[kind].get(where.id);
      if (!found) throw new Error('topilmadi');
      return Promise.resolve(withCount(found));
    },
    create: ({ data }: { data: { name: string; slug: string } }) => {
      if ([...store[kind].values()].some((r) => r.slug === data.slug)) {
        // Prisma unique buzilishini REJECT qiladi, sinxron `throw` emas
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('duplicate', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        );
      }
      const created = row({ id: `new-${String(store[kind].size + 1)}`, ...data });
      store[kind].set(created.id, created);
      return Promise.resolve(withCount(created));
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string; updatedAt?: Date | { lte: Date } };
      data: Partial<Row>;
    }) => {
      const current = store[kind].get(where.id);
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
        current.updatedAt.getTime() !== where.updatedAt.getTime()
      ) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('eskirgan', {
            code: 'P2025',
            clientVersion: 'test',
          }),
        );
      }
      if (
        data.slug &&
        [...store[kind].values()].some((r) => r.id !== where.id && r.slug === data.slug)
      ) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('duplicate', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        );
      }
      const next = { ...current, ...data, updatedAt: new Date(current.updatedAt.getTime() + 1000) };
      store[kind].set(where.id, next);
      return Promise.resolve(withCount(next));
    },
  });

  const productDelegate = {
    findMany: ({ where }: { where: { brandId?: string } }) =>
      Promise.resolve(
        [...products.values()]
          .filter((p) => !where.brandId || p.brandId === where.brandId)
          .map((p) => ({ id: p.id, model: p.model, storage: p.storage, color: p.color })),
      ),
    update: ({ where, data }: { where: { id: string }; data: { displayName: string } }) => {
      const current = products.get(where.id);
      if (current) products.set(where.id, { ...current, ...data });
      return Promise.resolve(current);
    },
    updateMany: ({
      where,
      data,
    }: {
      where: { brandId?: string; categoryId?: string };
      data: { brandId?: string; categoryId?: string };
    }) => {
      let count = 0;
      for (const [id, p] of products) {
        const matches = where.brandId
          ? p.brandId === where.brandId
          : p.categoryId === where.categoryId;
        if (!matches) continue;
        products.set(id, { ...p, ...data });
        count += 1;
      }
      return Promise.resolve({ count });
    },
  };

  const client = {
    brand: delegateFor('brand'),
    category: delegateFor('category'),
    product: productDelegate,
  };

  const prisma = {
    ...client,
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(client),
  };

  const service = new TaxonomyService(prisma as never, audit as never);
  return { service, audit, store, products };
}

function precondition(updatedAt: Date) {
  return readPrecondition({ headers: {} } as unknown as Request, updatedAt.toISOString());
}

describe('TaxonomyService — yaratish (§4.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('nom slug bilan birga saqlanadi', async () => {
    const { service } = makeService();
    const created = await service.create('brand', 'Apple', ACTOR, null);

    expect(created.name).toBe('Apple');
    expect(created.slug).toBe('apple');
  });

  it('slug to‘qnashuvi 409 beradi, 500 EMAS', async () => {
    const { service } = makeService({ brands: [row({ id: 'b1', name: 'Apple', slug: 'apple' })] });

    try {
      await service.create('brand', 'APPLE', ACTOR, null);
      expect.unreachable('to‘qnashuv kutilgan edi');
    } catch (error) {
      const exception = error as AppException;
      expect(exception.code).toBe(ErrorCode.CATALOG_DUPLICATE_NAME);
      // UI mavjud yozuvni tanlay olishi uchun
      expect(exception.details).toMatchObject({ existingId: 'b1', isActive: true });
    }
  });

  it('arxivdagi yozuv bilan to‘qnashuv boshqacha matn beradi', async () => {
    const { service } = makeService({
      brands: [row({ id: 'b1', name: 'Apple', slug: 'apple', isActive: false })],
    });

    try {
      await service.create('brand', 'Apple', ACTOR, null);
      expect.unreachable('to‘qnashuv kutilgan edi');
    } catch (error) {
      const exception = error as AppException;
      expect(exception.details).toMatchObject({ isActive: false });
      expect(exception.userMessage).toContain('arxiv');
    }
  });
});

describe('TaxonomyService — nomni o‘zgartirish (§4.6)', () => {
  const products: ProductRow[] = [
    {
      id: 'p1',
      brandId: 'b1',
      categoryId: 'c1',
      model: 'iPhone 15',
      storage: '256GB',
      color: 'Qora',
      displayName: 'Aplle iPhone 15 256GB Qora',
    },
    {
      id: 'p2',
      brandId: 'b1',
      categoryId: 'c1',
      model: 'Kabel',
      storage: null,
      color: null,
      displayName: 'Aplle Kabel',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('BREND nomi o‘zgarsa mahsulot nomlari qayta yig‘iladi', async () => {
    const service = makeService({
      brands: [row({ id: 'b1', name: 'Aplle', slug: 'aplle' })],
      products,
    });

    await service.service.update(
      'brand',
      'b1',
      { name: 'Apple' },
      precondition(UPDATED_AT),
      ACTOR,
      null,
    );

    expect(service.products.get('p1')?.displayName).toBe('Apple iPhone 15 256GB Qora');
    // §4.7 — aksessuarda xotira/rang yo'q
    expect(service.products.get('p2')?.displayName).toBe('Apple Kabel');
  });

  /**
   * §4.6 formulasida kategoriya QATNASHMAYDI. Bu yerda qayta yig'ish
   * har doim aynan o'sha satrni yozardi — behuda so'rov. Test buni
   * qotirib qo'yadi, aks holda kimdir "tuzatib" qo'yadi.
   */
  it('KATEGORIYA nomi o‘zgarsa mahsulot nomlariga TEGILMAYDI', async () => {
    const service = makeService({
      categories: [row({ id: 'c1', name: 'Telefonlar', slug: 'telefonlar' })],
      products,
    });

    await service.service.update(
      'category',
      'c1',
      { name: 'Smartfonlar' },
      precondition(UPDATED_AT),
      ACTOR,
      null,
    );

    expect(service.products.get('p1')?.displayName).toBe('Aplle iPhone 15 256GB Qora');
  });

  it('eskirgan qulf tokeni → STALE_RESOURCE', async () => {
    const { service } = makeService({ brands: [row({ id: 'b1', name: 'Apple', slug: 'apple' })] });

    try {
      await service.update(
        'brand',
        'b1',
        { name: 'Apple Inc' },
        precondition(new Date(UPDATED_AT.getTime() - 5000)),
        ACTOR,
        null,
      );
      expect.unreachable('konflikt kutilgan edi');
    } catch (error) {
      expect((error as AppException).code).toBe(ErrorCode.STALE_RESOURCE);
    }
  });

  it('o‘zgarish bo‘lmasa audit yozilmaydi', async () => {
    const { service, audit } = makeService({
      brands: [row({ id: 'b1', name: 'Apple', slug: 'apple' })],
    });

    await service.update('brand', 'b1', { name: 'Apple' }, precondition(UPDATED_AT), ACTOR, null);
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('TaxonomyService — birlashtirish (§4.4)', () => {
  const base = () => ({
    brands: [
      row({ id: 'src', name: 'Aplle', slug: 'aplle' }),
      row({ id: 'tgt', name: 'Apple', slug: 'apple' }),
    ],
    products: [
      {
        id: 'p1',
        brandId: 'src',
        categoryId: 'c1',
        model: 'iPhone 15',
        storage: '256GB',
        color: 'Qora',
        displayName: 'Aplle iPhone 15 256GB Qora',
      },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mahsulotlar ko‘chadi, manba arxivlanadi, slug BO‘SHAYDI', async () => {
    const { service, store, products } = makeService(base());

    const result = await service.merge(
      'brand',
      'src',
      'tgt',
      precondition(UPDATED_AT),
      ACTOR,
      null,
    );

    expect(result.movedProductCount).toBe(1);
    expect(products.get('p1')?.brandId).toBe('tgt');

    const source = store.brand.get('src');
    expect(source?.isActive).toBe(false);
    // Bo'shatilmasa "Aplle" nomini qayta yaratib bo'lmasdi
    expect(source?.slug).not.toBe('aplle');
    expect(source?.slug).toMatch(/^aplle--merged-/);
  });

  it('ko‘chirilgan mahsulot nomi nishon brend bilan qayta yig‘iladi', async () => {
    const { service, products } = makeService(base());

    await service.merge('brand', 'src', 'tgt', precondition(UPDATED_AT), ACTOR, null);

    expect(products.get('p1')?.displayName).toBe('Apple iPhone 15 256GB Qora');
  });

  it('audit yozuvi manba va nishonni ham saqlaydi', async () => {
    const { service, audit } = makeService(base());

    await service.merge('brand', 'src', 'tgt', precondition(UPDATED_AT), ACTOR, null);

    expect(audit.record).toHaveBeenCalledOnce();
    const entry = audit.record.mock.calls[0]?.[2];
    expect(entry?.action).toBe('BRAND_MERGED');
    expect(entry?.after).toMatchObject({ targetId: 'tgt', movedProductCount: 1 });
  });

  it('o‘zini o‘ziga birlashtirish rad etiladi', async () => {
    const { service } = makeService(base());

    try {
      await service.merge('brand', 'src', 'src', precondition(UPDATED_AT), ACTOR, null);
      expect.unreachable('xato kutilgan edi');
    } catch (error) {
      const exception = error as AppException;
      expect(exception.code).toBe(ErrorCode.CATALOG_MERGE_INVALID_TARGET);
      expect(exception.details).toMatchObject({ reason: 'SELF' });
    }
  });

  it('arxivdagi nishonga birlashtirib bo‘lmaydi', async () => {
    const data = base();
    data.brands[1] = row({ id: 'tgt', name: 'Apple', slug: 'apple', isActive: false });
    const { service } = makeService(data);

    try {
      await service.merge('brand', 'src', 'tgt', precondition(UPDATED_AT), ACTOR, null);
      expect.unreachable('xato kutilgan edi');
    } catch (error) {
      expect((error as AppException).details).toMatchObject({ reason: 'ARCHIVED' });
    }
  });

  it('eskirgan token bilan birlashtirish rad etiladi va manba tegilmaydi', async () => {
    const { service, store, products } = makeService(base());

    await expect(
      service.merge(
        'brand',
        'src',
        'tgt',
        precondition(new Date(UPDATED_AT.getTime() - 5000)),
        ACTOR,
        null,
      ),
    ).rejects.toThrow(AppException);

    expect(store.brand.get('src')?.isActive).toBe(true);
    expect(products.get('p1')?.brandId).toBe('src');
  });
});
