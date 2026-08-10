import { z } from 'zod';

import { MAX_PAGE_LIMIT } from '../pagination';

/**
 * Sxemalarda qayta ishlatiladigan asosiy tiplar (`FRONTEND.md` §6.1).
 *
 * Sxemalar AYNAN shu paketda turadi va ikkala tomon ham shu yerdan oladi:
 * web tezkor javob uchun, api majburiy qayta tekshiruv uchun. Ikki joyda
 * ikki xil qoida yozilsa, foydalanuvchi "forma to'g'ri edi, lekin server
 * rad etdi" holatiga tushadi.
 */

const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** Siljish (`Z` yoki `±HH:MM`) **majburiy** — sababi `isoDateTime` izohida. */
const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

/**
 * Decimal maydon — JSON'da har doim **string** (`API.md` §2.1).
 *
 * `number` ham qabul qilinadi (forma inputidan kelishi mumkin), lekin
 * darhol satrga aylantiriladi: undan keyingi hech bir qadamda float
 * arifmetikasi bo'lmaydi.
 */
export const decimalString = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => DECIMAL_PATTERN.test(value), {
    message: "Son noto'g'ri kiritilgan",
  });

/**
 * Chegaralangan decimal (masalan foiz: 0–100).
 *
 * Bu yerda `Number()` bilan solishtirish xavfsiz: taqqoslash xatoni
 * **jamlamaydi**, `roundMoney` dagi qo'shish-ayirishdan farqli o'laroq.
 * Saqlanadigan qiymat baribir satr bo'lib qoladi.
 */
export function decimalInRange(min: number, max: number, message: string) {
  return decimalString.refine(
    (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= min && parsed <= max;
    },
    { message },
  );
}

/** `"09:00"` — ish vaqti (§3.7). */
export const timeOfDay = z
  .string()
  .trim()
  .regex(TIME_PATTERN, { message: "Vaqt HH:MM ko'rinishida bo'lsin" });

/**
 * `"2026-08-10T09:30:00.000Z"` — aniq vaqt nuqtasi.
 *
 * Siljishsiz satr (`2026-08-10T09:30:00`) **qabul qilinmaydi**: uni
 * `new Date()` mahalliy vaqt deb o'qiydi, ya'ni Toshkentda 5 soatga
 * siljigan qiymat chiqadi. Optimistik qulfda (`API.md` §8) bu 5 soatlik
 * xato konfliktni ko'rsatmay o'tkazib yuborardi — aynan qulf to'sishi
 * kerak bo'lgan holat.
 */
export const isoDateTime = z
  .string()
  .trim()
  .regex(ISO_DATE_TIME_PATTERN, {
    message: "Vaqt ISO 8601 ko'rinishida bo'lsin (masalan 2026-08-10T09:30:00.000Z)",
  })
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "Bunday vaqt yo'q",
  });

/**
 * Optimistik qulf tokeni (`API.md` §8) — client o'qigan yozuvning
 * `updatedAt` qiymati. `PATCH` sxemalari shu maydonni qo'shadi.
 */
export const expectedUpdatedAt = isoDateTime;

/** `"2026-09-15"` — kalendar sana (`API.md` §2.2), vaqt zonasiga bog'liq emas. */
export const calendarDate = z
  .string()
  .trim()
  .regex(CALENDAR_DATE_PATTERN, { message: "Sana YYYY-MM-DD ko'rinishida bo'lsin" })
  .refine(
    (value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      // `2026-02-31` naqshdan o'tadi, lekin mavjud sana emas —
      // JS uni 3-martga surib yuboradi, shuni ushlaymiz.
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    },
    { message: 'Bunday sana yo‘q' },
  );

/** UUID identifikator — barcha `:id` parametrlari va FK maydonlari uchun. */
export const uuidString = z.uuid({ message: "Identifikator noto'g'ri" });

/**
 * Musbat pul qiymati — bazadagi `*_positive` CHECK cheklovlarining
 * sxemadagi juftligi (`inventory_items_cost_positive`,
 * `inventory_batches_cost_positive`). Ikkalasi ataylab takrorlanadi:
 * sxema foydalanuvchiga tushunarli xato beradi, CHECK esa kod xatosidan
 * himoyaning oxirgi qatlami bo'lib qoladi.
 */
export const positiveDecimal = decimalString.refine((value) => Number(value) > 0, {
  message: "Qiymat noldan katta bo'lishi kerak",
});

/**
 * Kursor pagination maydonlari (`API.md` §5.1).
 *
 * Har ro'yxat sxemasiga `...pageQueryFields` bilan qo'shiladi — beshta
 * endpoint beshta boshqacha `limit` chegarasi ixtiro qilmasin.
 */
export const pageQueryFields = {
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_LIMIT).optional(),
};

/**
 * Arxivlangan yozuvlarni ko'rsatish filtri (§4.8 — o'chirilmaydi, arxivlanadi).
 *
 * Default `active`: ro'yxat odatda ishlaydigan yozuvlarni ko'rsatadi.
 * `all` varianti dublikat qidiruvida kerak — arxivdagi mahsulot ham
 * "bunday nom bor" degan javobga kirishi kerak.
 */
export const activeFilter = z.enum(['active', 'archived', 'all']).default('active');
export type ActiveFilter = z.infer<typeof activeFilter>;

/**
 * `?status=AVAILABLE,SOLD` — vergul bilan ajratilgan enum ro'yxati
 * (`API.md` §5.2).
 *
 * Bo'sh bo'laklar tashlanadi (`?status=AVAILABLE,` odatiy xato), lekin
 * butunlay bo'sh ro'yxat rad etiladi: `?status=` "hech narsa ko'rsatma"
 * degani emas, u client xatosi.
 */
export function enumList<T extends Record<string, string>>(source: T, message: string) {
  return z
    .string()
    .transform((raw) =>
      raw
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    )
    .pipe(z.array(z.enum(source)).min(1, message));
}
