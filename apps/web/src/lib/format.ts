/**
 * Sana va matn formatlash (`FRONTEND.md` §3 — pul `contracts` da).
 *
 * "Bugun" va barcha vaqtlar **do'kon zonasida** ko'rsatiladi (`API.md`
 * §2.2), foydalanuvchi qurilmasining zonasida emas: ega chet elda bo'lsa
 * ham hisobot do'kon kuni bo'yicha o'qilishi kerak.
 *
 * `Intl` ataylab to'g'ridan-to'g'ri ishlatiladi: kerak bo'lgani — zona
 * bo'yicha formatlash, uni brauzer o'zi biladi. `date-fns-tz` bu yerda
 * qo'shimcha qiymat bermaydi; murakkabroq sana arifmetikasi paydo
 * bo'lganda qo'shiladi (`FRONTEND.md` §2).
 */

export const SHOP_TIME_ZONE = 'Asia/Tashkent';

const DATE_TIME = new Intl.DateTimeFormat('sv-SE', {
  timeZone: SHOP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_ONLY = new Intl.DateTimeFormat('sv-SE', {
  timeZone: SHOP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `"2026-08-10 14:30"` — jurnal va sessiya ro'yxati uchun. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME.format(date).replace(',', '');
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : DATE_ONLY.format(date);
}

/** Do'kon zonasidagi bugungi kalendar sana, `YYYY-MM-DD`. */
export function todayInShopZone(): string {
  return DATE_ONLY.format(new Date());
}

/**
 * `User-Agent` dan o'qiladigan qurilma nomi (§2.7 — "qurilma" ustuni).
 *
 * To'liq `User-Agent` satri foydalanuvchiga hech narsa aytmaydi. Aniq
 * qurilma aniqlash kerak emas — kifoya qiladigan javob: "bu men
 * turgan brauzermi yoki boshqasimi".
 */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Noma'lum qurilma";

  const os = /Android/i.test(userAgent)
    ? 'Android'
    : /iPhone|iPad|iOS/i.test(userAgent)
      ? 'iOS'
      : /Windows/i.test(userAgent)
        ? 'Windows'
        : /Mac OS X|Macintosh/i.test(userAgent)
          ? 'macOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : null;

  const browser = /Edg\//i.test(userAgent)
    ? 'Edge'
    : /Chrome\//i.test(userAgent)
      ? 'Chrome'
      : /Safari\//i.test(userAgent)
        ? 'Safari'
        : /Firefox\//i.test(userAgent)
          ? 'Firefox'
          : /curl/i.test(userAgent)
            ? 'curl'
            : null;

  if (browser && os) return `${browser} · ${os}`;
  return browser ?? os ?? "Noma'lum qurilma";
}
