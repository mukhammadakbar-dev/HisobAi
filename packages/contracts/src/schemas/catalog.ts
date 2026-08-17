import { z } from 'zod';

import { Currency, ProductType } from '../enums';
import { activeFilter, pageQueryFields, positiveDecimal, uuidString } from './common';
import { fileIdField } from './file';

/**
 * Katalog: kategoriya, brend va mahsulot shabloni (§4).
 *
 * `displayName` **hech bir kirish sxemasida yo'q**: u §4.6 bo'yicha
 * serverda `buildDisplayName` bilan yig'iladi. `.strict()` uni rad
 * etadi — client yuborgan nom bazadagi haqiqatdan chetga chiqishiga
 * yo'l qo'yilmaydi (`PERMISSIONS.md` P2 dagi mass assignment naqshi).
 */

const catalogName = z.string().trim().min(1, 'Nomni kiriting').max(60, 'Nom 60 belgidan oshmasin');

// ───────────────────────── Kategoriya va brend ─────────────────────────

/**
 * Kategoriya va brend tuzilishi bir xil, shuning uchun maydonlar bir
 * marta yoziladi. Nomlangan eksportlar esa alohida: kelajakda biri
 * ajralib chiqsa, o'zgarish bitta qatorda bo'ladi.
 */
const taxonomyCreateFields = { name: catalogName };
const taxonomyUpdateFields = {
  name: catalogName.optional(),
  /** §4.8 — arxivlash; o'chirish yo'q. */
  isActive: z.boolean().optional(),
  expectedUpdatedAt: z.string().optional(),
};

export const createCategorySchema = z.object(taxonomyCreateFields).strict();
export const createBrandSchema = z.object(taxonomyCreateFields).strict();
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateBrandInput = z.infer<typeof createBrandSchema>;

const taxonomyUpdate = z
  .object(taxonomyUpdateFields)
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedUpdatedAt'), {
    message: "O'zgartirish uchun kamida bitta maydon yuboring",
  });

export const updateCategorySchema = taxonomyUpdate;
export const updateBrandSchema = taxonomyUpdate;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;

/**
 * §4.4 — birlashtirish. Manba nishonga qo'shiladi va arxivlanadi.
 *
 * `expectedUpdatedAt` majburiy emas, chunki `If-Unmodified-Since`
 * sarlavhasi ham qabul qilinadi (`API.md` §8) — lekin ikkisidan biri
 * bo'lishi shart, buni server tekshiradi.
 */
export const mergeTaxonomySchema = z
  .object({
    targetId: uuidString,
    expectedUpdatedAt: z.string().optional(),
  })
  .strict();
export type MergeTaxonomyInput = z.infer<typeof mergeTaxonomySchema>;

export const taxonomyQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(60).optional(),
    isActive: activeFilter,
    sort: z.enum(['name', '-name', '-createdAt']).default('name'),
    ...pageQueryFields,
  })
  .strict();
export type TaxonomyQuery = z.infer<typeof taxonomyQuerySchema>;

export interface TaxonomyDto {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  /** Ro'yxatda "3 ta mahsulot" deb ko'rsatiladi; birlashtirishdan oldin muhim. */
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export type CategoryDto = TaxonomyDto;
export type BrandDto = TaxonomyDto;

export interface TaxonomyMergeResultDto {
  target: TaxonomyDto;
  movedProductCount: number;
}

// ──────────────────────────── Mahsulot ────────────────────────────

const productFields = {
  categoryId: uuidString,
  brandId: uuidString,
  model: z.string().trim().min(1, 'Model nomini kiriting').max(80),
  /** §4.7 — aksessuarlarda bo'sh qoladi. */
  storage: z.string().trim().max(20).nullable(),
  color: z.string().trim().max(30).nullable(),
  type: z.enum(ProductType),
  /** §1.2 — mahsulotga bitta valyuta; tannarx ham shu valyutada bo'ladi. */
  currency: z.enum(Currency),
  /** §4.2 — faqat tavsiya; haqiqiy narx savdo paytida qo'yiladi. */
  suggestedPrice: positiveDecimal.nullable(),
  /** §3.8 — `null` bo'lsa sozlamalardagi umumiy chegara ishlatiladi. */
  lowStockThreshold: z.number().int().min(0, "Chegara manfiy bo'lmaydi").nullable(),
  description: z.string().trim().max(1000).nullable(),
  /** §18.1 — mahsulot rasmi, oldindan yuklangan `PRODUCT_IMAGE`ga havola. */
  imageFileId: fileIdField,
};

export const createProductSchema = z.object(productFields).strict();
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object(productFields)
  .partial()
  .extend({
    isActive: z.boolean().optional(),
    expectedUpdatedAt: z.string().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedUpdatedAt'), {
    message: "O'zgartirish uchun kamida bitta maydon yuboring",
  });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productQuerySchema = z
  .object({
    /** Nom bo'yicha qidiruv — `products_display_name_trgm_idx` xizmat qiladi. */
    q: z.string().trim().min(1).max(120).optional(),
    categoryId: uuidString.optional(),
    brandId: uuidString.optional(),
    type: z.enum(ProductType).optional(),
    isActive: activeFilter,
    sort: z.enum(['displayName', '-displayName', 'createdAt', '-createdAt']).default('displayName'),
    ...pageQueryFields,
  })
  .strict();
export type ProductQuery = z.infer<typeof productQuerySchema>;

/** Qoldiq — seriyalida `AVAILABLE` birliklar soni, miqdorlida partiya qoldig'i. */
export interface ProductStockDto {
  available: number;
  /** §3.8 — mahsulot chegarasi, u yo'q bo'lsa sozlamalardagi umumiy chegara. */
  isLowStock: boolean;
}

export interface ProductDto {
  id: string;
  categoryId: string;
  categoryName: string;
  brandId: string;
  brandName: string;
  model: string;
  storage: string | null;
  color: string | null;
  /** §4.6 — serverda yig'iladi, client yubormaydi. */
  displayName: string;
  type: ProductType;
  currency: Currency;
  /** Decimal — satr sifatida (`API.md` §2.1). */
  suggestedPrice: string | null;
  /**
   * §4.2 — oxirgi qabuldagi tannarx, qabul formasini oldindan
   * to'ldirish uchun. `PERMISSIONS.md` P7: bu alohida barg maydon,
   * shuning uchun kelajakda rolga qarab kesib tashlash mumkin.
   */
  lastCostPrice: string | null;
  lowStockThreshold: number | null;
  description: string | null;
  /** §18.1 — `GET /files/:id` orqali vaqtinchalik havola olinadi. */
  imageFileId: string | null;
  isActive: boolean;
  stock: ProductStockDto;
  createdAt: string;
  updatedAt: string;
}

/** Ombor va harakat ro'yxatlarida mahsulotni ko'rsatish uchun qisqa shakl. */
export interface ProductSummaryDto {
  id: string;
  displayName: string;
  type: ProductType;
  currency: Currency;
}
