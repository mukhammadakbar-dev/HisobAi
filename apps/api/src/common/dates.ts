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

/**
 * Berilgan vaqt nuqtasida zonaning UTC'dan siljishi (millisekundda).
 *
 * `Intl` sanani zona bo'yicha yoyadi; o'sha qismlarni UTC deb qayta
 * yig'sak, farq aynan siljish bo'ladi. Bu usul yozgi vaqtga ham bardosh
 * beradi — O'zbekistonda u yo'q, lekin `TIMEZONE` sozlanadigan bo'lgani
 * uchun formula umumiy qoladi.
 */
export function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  // `hour12: false` ba'zi muhitlarda yarim tunni 24 deb beradi — 0 ga keltiramiz
  const hour = read('hour') % 24;
  const asUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    hour,
    read('minute'),
    read('second'),
  );
  // Millisekundlar `formatToParts` da yo'q — ularni asl qiymatdan olamiz
  return asUtc - (instant.getTime() - instant.getMilliseconds());
}

/** Do'kon zonasidagi soat (0–23). */
export function hourInTimeZone(instant: Date, timeZone: string): number {
  return (
    Number(
      new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, hour: '2-digit' }).format(
        instant,
      ),
    ) % 24
  );
}

/**
 * Do'kon zonasida ko'rsatilgan soatning keyingi kelishi (§3.3 — 09:00).
 *
 * `from` shu soatdan keyin bo'lsa, ertangi kun olinadi. Siljish ikki
 * marta hisoblanadi: birinchi taxminiy natija zona chegarasidan o'tib
 * ketgan bo'lsa (yozgi vaqt), ikkinchi hisob uni to'g'irlaydi.
 */
export function nextOccurrenceOfHour(
  hour: number,
  timeZone: string,
  from: Date = new Date(),
): Date {
  const localDay = businessDay(from, timeZone);
  const [year = 0, month = 0, day = 0] = localDay.split('-').map(Number);

  const build = (dayOffset: number): Date => {
    const naiveUtc = Date.UTC(year, month - 1, day + dayOffset, hour, 0, 0, 0);
    let instant = new Date(naiveUtc - timeZoneOffsetMs(new Date(naiveUtc), timeZone));
    // Siljish o'zgargan bo'lsa bir marta qayta hisoblaymiz
    instant = new Date(naiveUtc - timeZoneOffsetMs(instant, timeZone));
    return instant;
  };

  const todayRun = build(0);
  return todayRun.getTime() > from.getTime() ? todayRun : build(1);
}
