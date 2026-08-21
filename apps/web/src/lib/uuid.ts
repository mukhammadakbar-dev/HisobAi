/**
 * UUID v4 — idempotency kalitlari uchun (`API.md` §4).
 *
 * **Nega `crypto.randomUUID()` to'g'ridan-to'g'ri ishlatilmaydi.** U faqat
 * XAVFSIZ KONTEKSTDA mavjud: `https://` yoki `localhost`. Telefondan LAN
 * orqali `http://10.x.x.x:3000` ga kirilganda `crypto.randomUUID`
 * `undefined` bo'ladi va uni chaqirgan har bir joy `TypeError` bilan
 * yiqiladi — savdo tasdiqlash, nasiya to'lovini qabul qilish, ombor
 * qabuli, kassa yozuvi va qaytarish. Ya'ni do'kondagi telefonda ilova
 * pul harakatlari uchun umuman ishlamas edi.
 *
 * `crypto.getRandomValues()` esa xavfsiz bo'lmagan kontekstda HAM
 * ishlaydi — cheklov faqat `randomUUID` va `crypto.subtle` ga tegishli.
 * Shuning uchun zaxira yo'l kriptografik jihatdan bir xil kuchda:
 * `Math.random()` ATAYLAB ishlatilmaydi.
 */
export function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  // RFC 4122 §4.4 — versiya (4) va variant (10xx) bitlari qo'yiladi
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
