/**
 * Sana yordamchilari (`API.md` §2.2, §17.9).
 *
 * Ikki xil sana tushunchasi bor va ular aralashmasligi kerak:
 *
 *  1. **Vaqt nuqtasi** (`timestamptz`) — `soldAt`, `paidAt`, `createdAt`.
 *     JSON'ga ISO 8601 sifatida chiqadi, `Date` o'z holicha qoladi.
 *  2. **Kalendar sana** (`@db.Date`) — `dueDate`, `exchangeRates.date`.
 *     Vaqt zonasiga bog'liq emas. Prisma uni UTC yarim tunidagi `Date`
 *     sifatida qaytaradi, shuning uchun sanani **UTC bo'yicha** olish
 *     shart — lokal zona bo'yicha olinsa bir kun sakrab ketishi mumkin.
 *
 * "Bugun" har doim do'kon vaqt zonasida hisoblanadi (`env.TIMEZONE`),
 * serverning lokal zonasida emas.
 */

/** `@db.Date` maydonini `"2026-09-15"` ko'rinishiga keltiradi. */
export function toCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `"2026-09-15"` → `@db.Date` uchun `Date` (UTC yarim tuni). */
export function fromCalendarDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Berilgan vaqt nuqtasi do'kon zonasida qaysi kalendar kunga to'g'ri
 * kelishini qaytaradi: `"2026-08-10"`.
 *
 * `sv-SE` lokali ataylab tanlangan — u `YYYY-MM-DD` formatini beradi va
 * qo'lda yig'ishga qaraganda ishonchliroq.
 */
export function businessDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Do'kon zonasidagi bugungi kalendar kun. */
export function today(timeZone: string, now: Date = new Date()): string {
  return businessDay(now, timeZone);
}

/**
 * Ikki kalendar kun orasidagi farq (kun hisobida).
 * Muddati o'tganlikni hisoblashda ishlatiladi (§9.8).
 */
export function daysBetween(from: string, to: string): number {
  const fromMs = fromCalendarDate(from).getTime();
  const toMs = fromCalendarDate(to).getTime();
  return Math.round((toMs - fromMs) / 86_400_000);
}
