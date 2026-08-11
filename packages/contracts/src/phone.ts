/**
 * Telefon raqamini normallashtirish (§6.2).
 *
 * `catalog.ts` dagi `slugifyCatalogName` kabi bu ham **ikkala ilova**
 * tomonidan ishlatiladi: API `phone_primary` ni shu bilan yozadi (ustun
 * `@unique`), web esa formada dublikat qidiruvini shu bilan quradi.
 * Ikkinchi implementatsiya yozilsa, "+998 90 123 45 67" va
 * "901234567" bazada ikki xil mijoz bo'lib qolardi — §6.2 ning
 * "takrorlanmaydi" kafolati aynan shu yerda buziladi.
 */

/** O'zbekiston kodi — `+` siz kiritilgan raqamga shu qo'shiladi. */
export const DEFAULT_COUNTRY_CODE = '998';

/** Mahalliy raqam uzunligi: `90 123 45 67` — to'qqiz raqam. */
const LOCAL_DIGITS = 9;

/** E.164: `+` va 7–15 raqam. */
const E164_PATTERN = /^\+\d{7,15}$/;

/** Ajratgichlar: probel, tire, qavs, nuqta — hammasi tashlanadi. */
const SEPARATORS = /[\s\-().]/gu;

/**
 * Kiritilgan raqamni E.164 ga keltiradi: `+998901234567`.
 *
 * Tanib bo'lmasa `null` qaytadi — bo'sh satr yoki asl qiymat emas.
 * Sabab: chaqiruvchi "normallashtirildi" va "normallashtirib bo'lmadi"
 * ni ajrata olishi kerak. Asl qiymat qaytarilsa, u bazaga tushib
 * ketardi va unique indeks ikki xil yozilgan bitta raqamni
 * to'smasdi.
 *
 * Qabul qilinadigan shakllar:
 *   "901234567"          → +998901234567   (mahalliy)
 *   "998901234567"       → +998901234567
 *   "+998 90 123 45 67"  → +998901234567
 *   "8 90 123 45 67"     → +998901234567   (eski trunk prefiksi)
 *   "+7 999 123 45 67"   → +79991234567    (chet el — `+` bilan)
 */
export function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(SEPARATORS, '');
  if (cleaned === '') return null;

  // `+` bilan boshlangan raqam — foydalanuvchi kodni o'zi ko'rsatgan
  if (cleaned.startsWith('+')) {
    const candidate = `+${cleaned.slice(1)}`;
    return E164_PATTERN.test(candidate) ? candidate : null;
  }

  if (!/^\d+$/u.test(cleaned)) return null;

  if (cleaned.length === LOCAL_DIGITS) {
    return `+${DEFAULT_COUNTRY_CODE}${cleaned}`;
  }

  // "998901234567" — kod bor, `+` yo'q
  if (
    cleaned.startsWith(DEFAULT_COUNTRY_CODE) &&
    cleaned.length === DEFAULT_COUNTRY_CODE.length + LOCAL_DIGITS
  ) {
    return `+${cleaned}`;
  }

  /**
   * Eski trunk prefiksi: "8 90 123 45 67".
   *
   * Faqat uzunlik aynan mos kelganda qabul qilinadi. Kengroq qoida
   * xavfli bo'lardi: qo'shni davlatlarda ham `8` trunk prefiksi va
   * ularning raqamlari boshqacha uzunlikda.
   */
  if (cleaned.startsWith('8') && cleaned.length === LOCAL_DIGITS + 1) {
    return `+${DEFAULT_COUNTRY_CODE}${cleaned.slice(1)}`;
  }

  return null;
}

/** Normallashtirib bo'ladimi — forma tekshiruvi uchun. */
export function isValidPhone(raw: string): boolean {
  return normalizePhone(raw) !== null;
}

/**
 * Ko'rsatish uchun: `+998901234567` → `+998 90 123 45 67`.
 *
 * Faqat O'zbekiston raqamlari guruhlanadi — boshqa davlatlarning
 * guruhlash qoidasi boshqacha va uni taxmin qilish noto'g'ri natija
 * beradi. Ular o'z holicha qaytadi.
 */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '—';

  const local = e164.startsWith(`+${DEFAULT_COUNTRY_CODE}`)
    ? e164.slice(DEFAULT_COUNTRY_CODE.length + 1)
    : null;
  if (local === null || local.length !== LOCAL_DIGITS) return e164;

  return `+${DEFAULT_COUNTRY_CODE} ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7)}`;
}
