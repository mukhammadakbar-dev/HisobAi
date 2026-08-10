import { z } from 'zod';

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
