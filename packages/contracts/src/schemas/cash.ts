import { z } from 'zod';

import { CashAccountKind, CashDirection, CashSourceType, Currency } from '../enums';
import type { CashSourceType as CashSourceTypeValue } from '../enums';
import {
  calendarDate,
  enumList,
  expectedUpdatedAt,
  isoDateTime,
  pageQueryFields,
  positiveDecimal,
  uuidString,
} from './common';

/**
 * Kassa (§11).
 *
 * Uch qoida shu fayldagi cheklovlarni tushuntiradi:
 *
 *  - **hisoblar ajratilgan** (§11.1): karta puli kassa yashigida yo'q,
 *    shuning uchun yozuv valyutasi hisob valyutasiga teng bo'lishi shart
 *    va bu sxemada emas, serverda tekshiriladi (hisob valyutasi bazada);
 *  - **avtomatik yozuv qo'lda tahrirlanmaydi** (§11.7) — shuning uchun
 *    yaratish sxemasida `sourceType` umuman yo'q: qo'lda kiritilgan yozuv
 *    har doim `MANUAL`, boshqasini client tanlay olmaydi;
 *  - **boshlang'ich qoldiq alohida amal** (§11.4): u daromad emas va har
 *    hisob uchun bir marta bo'ladi, shuning uchun o'z endpointi bor.
 */

const accountName = z
  .string()
  .trim()
  .min(2, 'Hisob nomi juda qisqa')
  .max(60, 'Hisob nomi 60 belgidan oshmasin');

const note = z.string().trim().max(300, 'Izoh 300 belgidan oshmasin').nullable().optional();

// ──────────────────────────── Hisoblar (§11.1) ────────────────────────────

export const createCashAccountSchema = z
  .object({
    name: accountName,
    currency: z.enum(Currency),
    kind: z.enum(CashAccountKind),
    sortOrder: z.number().int().min(0).max(999).optional(),
  })
  .strict();
export type CreateCashAccountInput = z.infer<typeof createCashAccountSchema>;

/**
 * Valyuta va tur o'zgartirilmaydi.
 *
 * Sabab yozuvlarda: hisobda allaqachon o'z valyutasidagi yozuvlar
 * turibdi va valyutani almashtirish ularning hammasini bir zumda
 * yolg'onga aylantirardi. Kerak bo'lsa — yangi hisob ochiladi, eskisi
 * `isActive: false` bilan yopiladi.
 */
export const updateCashAccountSchema = z
  .object({
    name: accountName.optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    expectedUpdatedAt: expectedUpdatedAt.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedUpdatedAt'), {
    message: "O'zgartirish uchun kamida bitta maydon yuboring",
  });
export type UpdateCashAccountInput = z.infer<typeof updateCashAccountSchema>;

// ──────────────────────────── Kategoriyalar (§11.10) ────────────────────────────

export const createCashCategorySchema = z
  .object({
    name: z.string().trim().min(2, 'Kategoriya nomi juda qisqa').max(60),
    /** `null` — ikkala yo'nalishda ham ishlatiladigan kategoriya. */
    direction: z.enum(CashDirection).nullable().optional(),
  })
  .strict();
export type CreateCashCategoryInput = z.infer<typeof createCashCategorySchema>;

// ──────────────────────────── Yozuvlar (§11.9) ────────────────────────────

/**
 * Qo'lda kirim/chiqim.
 *
 * `occurredAt` ixtiyoriy: kiritilmasa "hozir". Kelajakdagi sana
 * qabul qilinmaydi — u kassa qoldig'ini bugun mavjud bo'lmagan pulga
 * oshirib qo'yardi; tekshiruv serverda, do'kon zonasi bo'yicha.
 */
export const createCashEntrySchema = z
  .object({
    accountId: uuidString,
    direction: z.enum(CashDirection),
    amount: positiveDecimal,
    occurredAt: isoDateTime.optional(),
    categoryId: uuidString.nullable().optional(),
    note,
  })
  .strict();
export type CreateCashEntryInput = z.infer<typeof createCashEntrySchema>;

/**
 * §11.8 — qo'lda kiritilgan yozuv **o'sha kuni ichida** tahrirlanadi.
 * Hisob va yo'nalish o'zgarmaydi: boshqa hisobga ko'chirish — bu yozuvni
 * o'chirib, yangisini kiritish, aks holda ikki hisobning tarixi bir
 * yozuvda chalkashib ketardi.
 */
export const updateCashEntrySchema = z
  .object({
    amount: positiveDecimal.optional(),
    categoryId: uuidString.nullable().optional(),
    note,
    expectedUpdatedAt: expectedUpdatedAt.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedUpdatedAt'), {
    message: "O'zgartirish uchun kamida bitta maydon yuboring",
  });
export type UpdateCashEntryInput = z.infer<typeof updateCashEntrySchema>;

/**
 * §11.8 — ertasiga tuzatish faqat teskari yozuv bilan.
 *
 * `reason` erkin matn (`rebuildScheduleSchema` bilan bir naqsh, §9.11):
 * bu yerda ham keyinroq "nega tuzatilgan" degan savolga audit'dan
 * tashqari javob berish kerak — sabab tekshiruv (audit) uchun, oldindan
 * belgilangan ro'yxat emas, chunki qo'lda kiritilgan xato juda xilma-xil
 * bo'lishi mumkin (noto'g'ri summa, noto'g'ri hisob, umuman xato yozuv).
 */
export const reverseCashEntrySchema = z
  .object({
    reason: z.string().trim().min(3, 'Sababni yozing').max(300),
  })
  .strict();
export type ReverseCashEntryInput = z.infer<typeof reverseCashEntrySchema>;

/** §11.4 — har hisob uchun bir marta; daromad deb sanalmaydi. */
export const openingBalanceSchema = z
  .object({
    accountId: uuidString,
    amount: positiveDecimal,
    occurredAt: isoDateTime.optional(),
    note,
  })
  .strict();
export type OpeningBalanceInput = z.infer<typeof openingBalanceSchema>;

/**
 * §11.6 — valyuta ayirboshlash.
 *
 * `toAmount` **client'dan olinmaydi**: u `fromAmount × rate` dan
 * hisoblanadi. Ikkalasi ham yuborilsa, ular bir-biriga zid bo'lgan
 * holatni hal qilish kerak bo'lardi va har qanday tanlov kassada
 * yo'qolgan yoki paydo bo'lgan pul qoldirardi.
 */
export const cashExchangeSchema = z
  .object({
    fromAccountId: uuidString,
    toAccountId: uuidString,
    fromAmount: positiveDecimal,
    rate: positiveDecimal,
    occurredAt: isoDateTime.optional(),
    note,
  })
  .strict()
  .refine((value) => value.fromAccountId !== value.toAccountId, {
    message: "Bir hisobning o'ziga ayirboshlab bo'lmaydi",
    path: ['toAccountId'],
  });
export type CashExchangeInput = z.infer<typeof cashExchangeSchema>;

export const cashEntryQuerySchema = z
  .object({
    accountId: uuidString.optional(),
    direction: z.enum(CashDirection).optional(),
    sourceType: enumList(CashSourceType, 'Kamida bitta turni tanlang').optional(),
    categoryId: uuidString.optional(),
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    ...pageQueryFields,
  })
  .strict();
export type CashEntryQuery = z.infer<typeof cashEntryQuerySchema>;

// ──────────────────────────────── Javoblar ────────────────────────────────

export interface CashAccountDto {
  id: string;
  name: string;
  currency: Currency;
  kind: CashAccountKind;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
}

/** Hisob + joriy qoldiq (`GET /cashbook/balances`). */
export interface CashBalanceDto extends CashAccountDto {
  /** Kirimlar − chiqimlar, hisob valyutasida. */
  balance: string;
  /** §11.4 — boshlang'ich qoldiq kiritilganmi (bir marta bo'ladi). */
  hasOpeningBalance: boolean;
}

export interface CashCategoryDto {
  id: string;
  name: string;
  slug: string;
  direction: CashDirection | null;
  isSystem: boolean;
  isActive: boolean;
}

export interface CashEntryDto {
  id: string;
  accountId: string;
  accountName: string;
  direction: CashDirection;
  amount: string;
  currency: Currency;
  occurredAt: string;
  categoryId: string | null;
  categoryName: string | null;
  sourceType: CashSourceTypeValue;
  sourceId: string | null;
  paymentId: string | null;
  /** §11.8 — bu yozuv qaysi asl yozuvni tuzatgani (faqat `REVERSAL` da). */
  reversesEntryId: string | null;
  note: string | null;
  /** §11.7, §11.8 — UI tahrirlash tugmasini shu bo'yicha ko'rsatadi. */
  editable: boolean;
  /**
   * §11.8 — teskari yozuv bilan tuzatish mumkinmi (UI tugmani shu
   * bo'yicha ko'rsatadi). `editable` bilan BIR VAQTDA rost bo'lmaydi:
   * o'sha kuni tahrir/o'chirish, ertasiga teskari yozuv.
   *
   * "Allaqachon teskari qilingan" holati bu yerda YO'Q — uni bilish
   * har qator uchun qo'shimcha so'rov talab qilardi. Bunday yozuvni
   * tuzatishga urinilsa server tushunarli xato qaytaradi.
   */
  reversible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CashExchangeDto {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  fromAmount: string;
  toAmount: string;
  rate: string;
  occurredAt: string;
  note: string | null;
}
