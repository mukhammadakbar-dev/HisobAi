import { z } from 'zod';

import { normalizePhone } from '../phone';
import { activeFilter, pageQueryFields } from './common';
import { fileIdField } from './file';

/**
 * Mijoz (§6).
 *
 * Telefon sxemaning **o'zida** normallashtiriladi: server ham, web ham
 * shu sxemani ishlatgani uchun bazaga har doim E.164 tushadi va
 * `phone_primary` ustunidagi `@unique` haqiqatan dublikatni to'sadi
 * (§6.2). Formada foydalanuvchi xohlagan ko'rinishda yozaveradi.
 *
 * Qarz maydoni **yo'q va bo'lmaydi** (§6.12): u tranzaksiyalardan
 * hisoblanadi. Kirish sxemasida bo'lsa, uni qo'lda yozish yo'li
 * ochilardi.
 */

const fullName = z
  .string()
  .trim()
  .min(3, "Ism-familiyani to'liq kiriting")
  .max(120, 'Ism 120 belgidan oshmasin');

/**
 * Telefon: normallashtiriladi, keyin tekshiriladi.
 *
 * Tartib muhim — avval `transform`, keyin `refine`: aks holda xato
 * xabari foydalanuvchi yozgan ko'rinishga emas, oraliq qiymatga
 * tegishli bo'lardi.
 */
const phone = z
  .string()
  .trim()
  .refine((val) => /^[+\d\s\-().]+$/.test(val), {
    message: "Telefon raqami faqat raqamlardan iborat bo'lishi kerak",
  })
  .transform((value) => normalizePhone(value))
  .refine((value): value is string => value !== null, {
    message: "Telefon raqami noto'g'ri (masalan +998 90 123 45 67)",
  });

/**
 * Ixtiyoriy telefon: bo'sh satr — "yo'q", xato emas.
 *
 * Tekshiruv `transform` dan **oldin** turadi va bu majburiy: aks holda
 * `normalizePhone` noto'g'ri raqamdan `null` qaytarardi va u "kiritilmagan"
 * dan farq qilmasdi — ya'ni xato terilgan qo'shimcha raqam jimgina
 * o'chib ketardi.
 */
const optionalPhone = z
  .string()
  .trim()
  .nullable()
  .superRefine((value, ctx) => {
    if (value === null || value === '') return;
    if (!/^[+\d\s\-().]+$/.test(value)) {
      ctx.addIssue({ code: 'custom', message: "Telefon raqami faqat raqamlardan iborat bo'lishi kerak" });
      return;
    }
    if (normalizePhone(value) === null) {
      ctx.addIssue({ code: 'custom', message: "Telefon raqami noto'g'ri" });
    }
  })
  .transform((value) => (value === null || value === '' ? null : normalizePhone(value)));

/**
 * §6.5 — passport ma'lumoti. Yagona maqsadi: nasiya shartnomasi
 * PDF'ida chiqishi (§16.10).
 *
 * **Format qat'iy emas** (§19.6). §6.5 bu maydonlarni ataylab "matn
 * maydonlari" deb ta'riflaydi: o'zbek pasporti `AA 1234567` bo'lsa ham,
 * ID-karta, chet el pasporti va eski namunadagi hujjatlar boshqacha
 * yoziladi. Qat'iy naqsh mijozni tizimga umuman kiritib bo'lmaydigan
 * qilardi, nasiya esa mijozsiz rasmiylashtirilmaydi (§6.1) — ya'ni
 * validatsiya savdoni to'xtatardi. Shu sabab bu yerda faqat **ma'nosiz
 * kiritishga** to'siq bor: uzunlik va belgilar to'plami.
 *
 * JSHSHIR — istisno: u ta'rifi bo'yicha aynan 14 raqamli o'zbek
 * identifikatori, ya'ni "14 ta raqam" formatning taxmini emas, tushunchaning
 * o'zi. Chet el fuqarosida u yo'q va maydon `null` bo'lib qolaveradi.
 */
const passportSeries = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/u, {
    message: "Seriya 2 ta lotin harfidan iborat bo'lsin (masalan AA)",
  });
const passportNumber = z
  .string()
  .trim()
  .regex(/^\d{7}$/u, {
    message: "Passport raqami 7 ta raqamdan iborat bo'lsin (masalan 1234567)",
  });
const pinfl = z
  .string()
  .trim()
  .regex(/^\d{14}$/u, { message: "JSHSHIR 14 ta raqamdan iborat bo'lsin" });

const customerFields = {
  fullName,
  /** §6.4 — SMS shunga ketadi, `@unique`. */
  phonePrimary: phone,
  phoneSecondary: optionalPhone,
  address: z.string().trim().max(200).nullable(),
  note: z.string().trim().max(1000).nullable(),
  passportSeries: passportSeries.nullable(),
  passportNumber: passportNumber.nullable(),
  pinfl: pinfl.nullable(),
  /** §19.2 — passport rasmi, oldindan yuklangan `PASSPORT`ga havola. */
  passportFileId: fileIdField,
};

export const createCustomerSchema = z.object(customerFields).strict();
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

/**
 * §6.9 — belgi sababsiz qo'yilmaydi.
 *
 * `customers_flag_has_reason` CHECK ning juftligi: baza oxirgi
 * himoya bo'lib qoladi, sxema esa aniq maydonga bog'langan o'zbekcha
 * xato beradi.
 */
export const updateCustomerSchema = z
  .object(customerFields)
  .partial()
  .extend({
    isFlagged: z.boolean().optional(),
    flagReason: z.string().trim().max(500).nullable().optional(),
    /** §6.13 — o'chirilmaydi, arxivlanadi. */
    isActive: z.boolean().optional(),
    expectedUpdatedAt: z.string().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedUpdatedAt'), {
    message: "O'zgartirish uchun kamida bitta maydon yuboring",
  })
  .refine((value) => value.isFlagged !== true || Boolean(value.flagReason), {
    message: 'Belgi sababini kiriting',
    path: ['flagReason'],
  });
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const customerQuerySchema = z
  .object({
    /** Ism, asosiy va qo'shimcha telefon bo'yicha (§6.4). */
    q: z.string().trim().min(1).max(120).optional(),
    isActive: activeFilter,
    /** §6.9 — belgilangan mijozlarni ajratib ko'rish. */
    isFlagged: z.enum(['true', 'false']).optional(),
    sort: z.enum(['fullName', '-fullName', '-createdAt']).default('fullName'),
    ...pageQueryFields,
  })
  .strict();
export type CustomerQuery = z.infer<typeof customerQuerySchema>;

/** Ro'yxat uchun — passport ma'lumoti **ataylab yo'q** (`PERMISSIONS.md` P5). */
export interface CustomerSummaryDto {
  id: string;
  fullName: string;
  phonePrimary: string;
  phoneSecondary: string | null;
  isFlagged: boolean;
  flagReason: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDto extends CustomerSummaryDto {
  address: string | null;
  note: string | null;
  passportSeries: string | null;
  passportNumber: string | null;
  pinfl: string | null;
  /**
   * §6.6, §6.7, §19.2 — matn maydonlari kabi faqat `withPassport`
   * (SHOP_ADMIN) uchun to'ldiriladi, aks holda `null`. Havolaning o'zi
   * emas — yuklab olish `GET /files/:id` orqali (§15.5).
   */
  passportFileId: string | null;
}

/**
 * §6.3 — "Bu raqam Alisher Karimovda bor. O'shami?"
 *
 * Dublikat xatosi mijoz **nomini** ham olib yuradi: usiz ega faqat
 * "bu raqam band" degan xabarni olardi va kimda ekanini qidirib
 * yurishga majbur bo'lardi.
 */
export interface DuplicateCustomerDto {
  existingId: string;
  fullName: string;
  isActive: boolean;
}
