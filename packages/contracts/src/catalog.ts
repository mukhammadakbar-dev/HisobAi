/**
 * Katalog domenining sof funksiyalari (§4.3, §4.6).
 *
 * `money.ts` va `rates.ts` kabi bu ham **ikkala ilova** tomonidan
 * ishlatiladi: API `products.display_name` ni shu bilan yozadi, web esa
 * formada jonli ko'rinish va dublikat qidiruvini shu bilan quradi.
 * Ikkinchi implementatsiya (masalan SQL'dagi `concat_ws`) qat'iyan
 * yozilmaydi — u bir kun asl nusxadan chetga chiqadi va nom bilan
 * qidiruv mos kelmay qoladi.
 */

/** §5.3 — IMEI aynan 15 raqam. Nostandart identifikator `serialNumber` ga tushadi. */
export const IMEI_PATTERN = /^\d{15}$/;

/**
 * Bitta qabulda nechta seriyali birlik kiritish mumkin.
 *
 * Chegara ixtiyoriy emas: `inventory_items_identifier_guard` har
 * identifikator uchun advisory lock oladi, ya'ni 200 qator × 3
 * identifikator = 600 qulf bitta tranzaksiyada. Buni oshirishdan oldin
 * PostgreSQL'dagi `max_locks_per_transaction` ni tekshirish kerak.
 */
export const MAX_RECEIVE_ROWS = 200;

export interface DisplayNameParts {
  brandName: string;
  model: string;
  /** §4.7 — aksessuarlarda bo'sh. */
  storage?: string | null;
  color?: string | null;
}

/**
 * §4.6 — "Apple" + "iPhone 15 Pro" + "256GB" + "Qora"
 *      → "Apple iPhone 15 Pro 256GB Qora"
 *
 * Bo'sh qismlar tushib qoladi (§4.7), shuning uchun aksessuar
 * "Apple Kabel" bo'lib chiqadi — qo'shimcha shart yozish kerak emas.
 * Ichki qo'sh probellar yig'iladi: "iPhone  15" va "iPhone 15" bir xil
 * nom bergani ma'qul, aks holda ular ikki xil mahsulotdek ko'rinadi.
 */
export function buildDisplayName(parts: DisplayNameParts): string {
  return [parts.brandName, parts.model, parts.storage, parts.color]
    .map((part) => (part ?? '').replace(/\s+/gu, ' ').trim())
    .filter((part) => part.length > 0)
    .join(' ');
}

/**
 * O'zbek lotin alifbosidagi tutuq belgisining variantlari.
 *
 * `O'zbekiston`, `Oʻzbekiston` va `O’zbekiston` — bitta so'z, lekin uch xil
 * bayt ketma-ketligi. Klaviatura, nusxa-ko'chirish va avtoto'g'rilash
 * ularni aralashtirib yuboradi. Slug'da hammasi **olib tashlanadi**
 * (almashtirilmaydi): shunda uch varianti ham bitta qiymatga tushadi va
 * §4.3 dagi "dublikat oldi olinadi" kafolati haqiqatan ishlaydi.
 */
const APOSTROPHES = /['‘’ʻʼ`´]/gu;

/** Slug'da saqlanadigan belgilar: istalgan alifbo harflari va raqamlar. */
const NON_SLUG_CHARS = /[^\p{L}\p{N}]+/gu;

/**
 * §4.3 — kategoriya va brend nomining normallashtirilgan kaliti.
 *
 * `categories.slug` va `brands.slug` ustunlari `@unique`, ya'ni dublikat
 * to'sig'i **aynan shu funksiya** qanchalik to'g'ri ishlashiga bog'liq.
 *
 * Ikkita tuzoq bor va ikkalasi ham jimgina buzadi:
 *
 *  1. **Faqat ASCII qoldirish** — kirill nomlar ("Самсунг") butunlay
 *     yo'qoladi va hamma bo'sh slug'ga tushib, bir-biri bilan soxta
 *     to'qnashadi. Shuning uchun `\p{L}` ishlatiladi, `a-z` emas.
 *  2. **Diakritikani saqlash** — "Café" va "Cafe" ikki xil brend bo'lib
 *     qoladi. NFKD + birlashtiruvchi belgilarni olib tashlash buni yopadi.
 *
 * Natija bo'sh chiqsa (masalan nom faqat emojidan iborat) — barqaror
 * zaxira kalit beriladi. Bo'sh satr qaytarish mumkin emas: u holda ikkita
 * turli emoji nom bitta slug'ga tushib, ikkinchisini yaratib bo'lmasdi.
 */
export function slugifyCatalogName(name: string): string {
  const slug = name
    .normalize('NFKD')
    // Birlashtiruvchi diakritik belgilar (NFKD ajratgandan keyin)
    .replace(/\p{M}+/gu, '')
    .replace(APOSTROPHES, '')
    .toLowerCase()
    .replace(NON_SLUG_CHARS, '-')
    .replace(/^-+|-+$/gu, '');

  return slug.length > 0 ? slug : `nom-${stableHash(name)}`;
}

/**
 * Qisqa barqaror hash — faqat zaxira slug uchun.
 *
 * Kriptografik emas va bo'lishi ham shart emas: vazifasi turli kirishlar
 * turli kalit olishi. `node:crypto` ataylab ishlatilmaydi — bu paketni
 * brauzer ham import qiladi.
 */
function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
