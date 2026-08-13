import { z } from 'zod';

import { decimalInRange, expectedUpdatedAt, timeOfDay } from './common';

/**
 * Do'kon (§3.6–§3.9, §21.4).
 *
 * Eski `settings` jadvali `shops` ga aylandi: do'kon ma'lumoti (nom,
 * manzil, telefon) va biznes sozlamalari (ish vaqti, kam qoldiq chegarasi,
 * nasiya standartlari, kurs ustamasi) bitta qatorda — Shop tenant chegarasi
 * bo'lgani uchun ular ajratilmaydi.
 *
 * Chegaralar bazadagi `CHECK` cheklovlari bilan **bir xil** (§17.8):
 * `shops_ranges_valid` va `shops_weekend_days_valid`. Ikkalasi ataylab
 * takrorlanadi — sxema foydalanuvchiga tushunarli xato beradi, `CHECK`
 * esa kod xatosidan himoyaning oxirgi qatlami bo'lib qoladi.
 */

const weekdayNumber = z
  .number()
  .int()
  .min(0, 'Hafta kuni 0 (yakshanba) dan 6 (shanba) gacha')
  .max(6, 'Hafta kuni 0 (yakshanba) dan 6 (shanba) gacha');

/** O'zgartirish mumkin bo'lgan maydonlar — qulf tokeni bundan tashqarida. */
const shopFields = z
  .object({
    // §3.6 — PDF, login sahifasi va eksportlarda ishlatiladi
    name: z.string().trim().min(1, "Do'kon nomini kiriting").max(120),
    address: z.string().trim().max(300).nullable(),
    phone: z.string().trim().max(30).nullable(),

    // §3.7 — hisobot o'rtachalari va dam olish kunida eslatma yubormaslik uchun
    workStart: timeOfDay,
    workEnd: timeOfDay,
    weekendDays: z.array(weekdayNumber).max(7),

    // §3.8 — mahsulotga alohida chegara qo'yilmasa shu ishlatiladi
    lowStockThreshold: z.number().int().min(0, "Chegara manfiy bo'lmaydi"),

    // §3.9 — nasiya formasida oldindan to'ldiriladi
    defaultInstallmentMonths: z.number().int().positive('Muddat kamida 1 oy'),
    defaultDownPaymentPercent: decimalInRange(0, 100, "Foiz 0 dan 100 gacha bo'lsin"),

    // §16.2 — do'kon kursi = round(CBU × (1 + ustama% / 100))
    storeRateMarkupPercent: decimalInRange(0, 100, "Ustama 0 dan 100 gacha bo'lsin"),

    // §18 — eslatmalar shu soatda yuboriladi
    reminderHour: z.number().int().min(0).max(23, 'Soat 0 dan 23 gacha'),
  })
  .partial();

/**
 * `PATCH /shops/me` — `PERMISSIONS.md` P2 (mass assignment) himoyasi
 * `.strict()` bilan: `id`, `logoFileId`, `updatedById`, va endi (§21.4,
 * §21.6, §21.10) tenant-modelga xos `shopId`/`status` kabi maydonlar ham
 * `shopFields`da YO'Q — noma'lum kalit `.strict()` tomonidan rad etiladi,
 * jimgina e'tiborsiz qoldirilmaydi.
 */
export const updateShopSchema = shopFields
  .extend({
    /**
     * Optimistik qulf (`API.md` §8) — client o'qigan `updatedAt`.
     * `If-Unmodified-Since` sarlavhasi bilan almashtirilishi mumkin,
     * lekin ikkalasidan biri **majburiy**: usiz ikki qurilmadan
     * tahrirlaganda oxirgi yozgan yutadi va birinchisi o'z o'zgarishi
     * yo'qolganini bilmaydi.
     */
    expectedUpdatedAt: expectedUpdatedAt.optional(),
  })
  .strict()
  /**
   * Bo'sh `PATCH` — deyarli har doim client xatosi (masalan noto'g'ri
   * maydon nomi `.strict()` dan o'tib ketolmadi). Jimgina 200 qaytarish
   * "saqlandi" degan yolg'on tasdiq bo'lardi.
   *
   * Qulf tokeni "o'zgarish" deb sanalmaydi — faqat u yuborilsa, hech
   * narsa o'zgarmaydi.
   */
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedUpdatedAt'), {
    message: "O'zgartirish uchun kamida bitta maydon yuboring",
  });
export type UpdateShopInput = z.infer<typeof updateShopSchema>;

/**
 * `GET /shops/me` javobi.
 *
 * `id` va `logoFileId` mavjud, lekin `PATCH` ularni **qabul qilmaydi**
 * (`PERMISSIONS.md` P2 — mass assignment). Logo alohida fayl yuklash
 * oqimi bilan o'rnatiladi.
 */
export interface ShopDto {
  id: string;
  name: string;
  logoFileId: string | null;
  address: string | null;
  phone: string | null;
  workStart: string;
  workEnd: string;
  weekendDays: number[];
  lowStockThreshold: number;
  defaultInstallmentMonths: number;
  /** Decimal — satr sifatida (`API.md` §2.1). */
  defaultDownPaymentPercent: string;
  storeRateMarkupPercent: string;
  reminderHour: number;
  updatedAt: string;
  updatedById: string | null;
}
