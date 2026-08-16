/**
 * Tasodifiy UUIDv4 — brauzer secure context'da bo'lmasa ham (`FRONTEND.md` §5.4).
 *
 * **Nega hook emas, oddiy funksiya.** Bu yerda React holati yo'q: qiymat
 * chaqirilgan zahoti ishlatiladi va uni "yangilash" degan tushuncha yo'q.
 * Ikki xil ehtiyoj bir-biriga o'xshab ko'rinadi, lekin ular boshqa-boshqa:
 *
 *  - **idempotency kaliti** serverga ketadi, forma umri davomida saqlanadi
 *    va faqat aniq holatlarda almashadi → `hooks/use-idempotency-key.ts`;
 *  - **ro'yxat qatorining `key` si** (savat qatori, to'lov qatori) faqat
 *    React'ga qaysi qator qaysiligini aytadi va hech qayerga yuborilmaydi
 *    → shu funksiya.
 *
 * Ikkalasini bitta hook'ga yig'ish "kalitni yangilash" ni ro'yxat
 * qatoriga ham taklif qilardi — u yerda bunday amal ma'nosiz va chalg'ituvchi.
 *
 * **Nega `crypto.randomUUID()` yolg'iz o'zi yetarli emas.** U faqat
 * **secure context** da (`https://` yoki `localhost`) mavjud. Do'kon
 * kompyuteri ilovani LAN orqali `http://192.168.1.10:3000` da ochsa,
 * `crypto.randomUUID` — `undefined`, va uni chaqirish render paytida
 * `TypeError` beradi: savdo formasi umuman ochilmaydi. `getRandomValues`
 * esa `http` da ham ishlaydi, shuning uchun zaxira yo'l o'sha orqali
 * yig'iladi. Kriptografik sifat bir xil — farq faqat qulaylikda.
 */
export function randomId(): string {
  // `typeof` bilan tekshiriladi: LAN'da xossaning o'zi yo'q, shuning
  // uchun uni chaqirmasdan turib bilishning boshqa yo'li yo'q
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte, index) =>
    taggedByte(byte, index).toString(16).padStart(2, '0'),
  ).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * RFC 4122 §4.4 — xom tasodifiy baytlarni UUIDv4 ga aylantiradi.
 *
 * 6-bayt yuqori yarmi versiyani (`4`), 8-bayt yuqori ikki biti variantni
 * (`10`) bildiradi. Ularsiz natija UUID shakliga o'xshaydi, lekin
 * versiyasi noto'g'ri bo'lardi — server `Idempotency-Key` ni format
 * bo'yicha tekshirishga o'tsa, jimgina rad etilardi.
 */
function taggedByte(byte: number, index: number): number {
  if (index === 6) return (byte & 0x0f) | 0x40;
  if (index === 8) return (byte & 0x3f) | 0x80;
  return byte;
}
