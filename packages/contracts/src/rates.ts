/**
 * Valyuta kursi hisoblari (§3.1, §16.2, §16.6).
 *
 * `money.ts` bilan bir xil qoida: bu yerda ham `Number` arifmetikasi
 * YO'Q. Kurs `Decimal(12,4)`, ustama `Decimal(5,2)`, natija esa butun
 * so'm — float bilan hisoblansa yaxlitlash chegarasida (`.5`) noto'g'ri
 * tomonga ketadi va do'kon kursi kunma-kun bir so'mga tebranadi.
 */

/** Kurs ustunining kasr xonalari — `exchange_rates.cbu_rate/store_rate`. */
const RATE_SCALE = 4n;
/** Ustama foizining kasr xonalari — `settings.store_rate_markup_percent`. */
const PERCENT_SCALE = 2n;

function toScaledBigInt(value: string | number, scale: bigint): bigint {
  const text = String(value).trim();
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) {
    throw new TypeError(`Kurs qiymati noto'g'ri: ${text}`);
  }
  const negative = match[1] === '-';
  const whole = match[2] === '' ? '0' : (match[2] ?? '0');
  const fraction = (match[3] ?? '').padEnd(Number(scale), '0').slice(0, Number(scale));
  const magnitude = BigInt(`${whole}${fraction}`);
  return negative ? -magnitude : magnitude;
}

/**
 * §16.2 — `do'kon kursi = round(CBU × (1 + ustama% / 100))`, butun so'mgacha.
 *
 * Nega foiz, absolyut ustama emas: absolyut ustama kurs o'sishi bilan
 * jimgina siqiladi (200 so'm 12 000 da 1.67%, 15 000 da 1.33%), §3.2 esa
 * kursning avtomatik hisoblanishini talab qiladi.
 *
 * Yaxlitlash — ROUND_HALF_UP, `roundMoney` bilan bir xil usul.
 */
export function computeStoreRate(cbuRate: string | number, markupPercent: string | number): string {
  const rate = toScaledBigInt(cbuRate, RATE_SCALE);
  const markup = toScaledBigInt(markupPercent, PERCENT_SCALE);
  if (rate <= 0n) {
    throw new RangeError("CBU kursi musbat bo'lishi kerak");
  }

  // (1 + p/100) = (10000 + p×100) / 10000, ya'ni PERCENT_SCALE=2 da (10^4 + markup)/10^4
  const markupNumerator = 10_000n + markup;
  const numerator = rate * markupNumerator;
  // rate 10^4 ga, markup esa yana 10^4 ga kattalashtirilgan → jami 10^8
  const denominator = 10n ** (RATE_SCALE + 4n);

  // ROUND_HALF_UP: ikkalasi ham musbat, shuning uchun yarmini qo'shib bo'lish yetarli
  return ((numerator + denominator / 2n) / denominator).toString();
}

/**
 * §16.6 — eskirganlik darajasi.
 *
 * "Eskirgan" = bugungi sana uchun qator yo'q. Sun'iy chegara ataylab
 * qo'yilmaydi: har qanday chegara "noto'g'ri kursda savdo qilamiz, lekin
 * aytmaymiz" degan jim oyna bo'lardi. Chegara faqat UI keskinligida.
 */
export const RateStaleness = {
  /** Bugungi kun uchun kurs bor. */
  FRESH: 'FRESH',
  /** 1–2 kun eski — sariq ogohlantirish. */
  WARN: 'WARN',
  /** 3 kun va undan ortiq — qizil ogohlantirish. */
  CRITICAL: 'CRITICAL',
} as const;
export type RateStaleness = (typeof RateStaleness)[keyof typeof RateStaleness];

export function rateStaleness(daysOld: number): RateStaleness {
  if (daysOld <= 0) return RateStaleness.FRESH;
  if (daysOld >= 3) return RateStaleness.CRITICAL;
  return RateStaleness.WARN;
}
