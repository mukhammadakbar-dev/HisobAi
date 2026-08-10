import { describe, expect, it } from 'vitest';

import { Currency, ProductType } from '../enums';
import {
  createProductSchema,
  productQuerySchema,
  taxonomyQuerySchema,
  updateCategorySchema,
  updateProductSchema,
} from './catalog';

const CATEGORY_ID = 'c619c9c0-8ecb-4119-97ac-08e74001fa2d';
const BRAND_ID = '42c9761e-0bcd-414a-92c1-bdd1bb1396d2';

const product = {
  categoryId: CATEGORY_ID,
  brandId: BRAND_ID,
  model: 'iPhone 15 Pro',
  storage: '256GB',
  color: 'Qora',
  type: ProductType.SERIALIZED,
  currency: Currency.USD,
  suggestedPrice: '1200',
  lowStockThreshold: 2,
  description: null,
};

describe('createProductSchema', () => {
  it("to'liq mahsulot o'tadi", () => {
    expect(createProductSchema.safeParse(product).success).toBe(true);
  });

  it('§4.7 — aksessuarda xotira va rang null bo‘lishi mumkin', () => {
    const result = createProductSchema.safeParse({ ...product, storage: null, color: null });
    expect(result.success).toBe(true);
  });

  /**
   * §4.6 — nom serverda yig'iladi. Client yuborgan nom qabul qilinsa,
   * u brend/model bilan mos kelmay qolishi mumkin edi.
   */
  it('displayName yuborilsa RAD ETILADI', () => {
    const result = createProductSchema.safeParse({ ...product, displayName: 'Soxta nom' });
    expect(result.success).toBe(false);
  });

  it('lastCostPrice ham yuborilmaydi — u qabuldan keladi (§4.2)', () => {
    expect(createProductSchema.safeParse({ ...product, lastCostPrice: '900' }).success).toBe(false);
  });

  it('tavsiya narxi nol bo‘lmaydi', () => {
    expect(createProductSchema.safeParse({ ...product, suggestedPrice: '0' }).success).toBe(false);
  });

  it('kam qoldiq chegarasi manfiy bo‘lmaydi', () => {
    expect(createProductSchema.safeParse({ ...product, lowStockThreshold: -1 }).success).toBe(
      false,
    );
  });
});

describe('updateProductSchema', () => {
  it('bitta maydon yetarli', () => {
    expect(updateProductSchema.safeParse({ model: 'iPhone 15' }).success).toBe(true);
  });

  it('faqat qulf tokeni — o‘zgarish yo‘q, rad etiladi', () => {
    const result = updateProductSchema.safeParse({
      expectedUpdatedAt: '2026-08-10T09:30:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('arxivlash mumkin (§4.8)', () => {
    expect(updateProductSchema.safeParse({ isActive: false }).success).toBe(true);
  });
});

describe('updateCategorySchema', () => {
  it('faqat qulf tokeni rad etiladi', () => {
    expect(
      updateCategorySchema.safeParse({ expectedUpdatedAt: '2026-08-10T09:30:00.000Z' }).success,
    ).toBe(false);
  });

  it('bo‘sh nom rad etiladi', () => {
    expect(updateCategorySchema.safeParse({ name: '   ' }).success).toBe(false);
  });
});

describe('ro‘yxat filtrlari', () => {
  it('noma‘lum parametr rad etiladi (`API.md` §5.2)', () => {
    expect(productQuerySchema.safeParse({ categry: 'x' }).success).toBe(false);
  });

  it('default: faqat faol yozuvlar', () => {
    const result = productQuerySchema.safeParse({});
    expect(result.data?.isActive).toBe('active');
    expect(result.data?.sort).toBe('displayName');
  });

  it('dublikat qidiruvi uchun `all` qiymati bor', () => {
    expect(productQuerySchema.safeParse({ isActive: 'all' }).success).toBe(true);
  });

  it('kategoriya filtri UUID bo‘lishi kerak', () => {
    expect(productQuerySchema.safeParse({ categoryId: 'abc' }).success).toBe(false);
  });

  it('taxonomiya sort oq ro‘yxati', () => {
    expect(taxonomyQuerySchema.safeParse({ sort: 'slug' }).success).toBe(false);
    expect(taxonomyQuerySchema.safeParse({ sort: '-createdAt' }).success).toBe(true);
  });
});
