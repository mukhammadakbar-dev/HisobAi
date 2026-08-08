import { CURRENCY_SCALE, Currency } from './enums';

/**
 * Pulni KO'RSATISH uchun yordamchilar.
 *
 * MUHIM: hisob-kitob bu yerda qilinmaydi. Server tomonida pul har doim
 * Prisma `Decimal` (`numeric(18,2)`) bo'lib qoladi — `number` bilan
 * qo'shish/ko'paytirish taqiqlanadi (ARCHITECTURE §4).
 *
 * Bu yerdagi `Number()` faqat formatlash uchun: UZS summalari amalda
 * ~10^12 dan oshmaydi, `Number.MAX_SAFE_INTEGER` esa ~9·10^15 — formatlashda
 * aniqlik yo'qolmaydi.
 */

export type MoneyInput = string | number;

/** §1.10 — UZS butun songacha, USD 2 kasr xonagacha. */
export function scaleOf(currency: Currency): number {
  return CURRENCY_SCALE[currency];
}

/**
 * Summani valyuta qoidasi bo'yicha yaxlitlaydi va string qaytaradi.
 * String qaytariladi — natija yana `Decimal`ga aylantirilishi mumkin bo'lsin.
 */
export function roundMoney(amount: MoneyInput, currency: Currency): string {
  const scale = scaleOf(currency);
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) {
    throw new TypeError(`roundMoney: noto'g'ri summa: ${String(amount)}`);
  }
  return value.toFixed(scale);
}

/** O'zbekcha lokal bilan formatlaydi: "12 500 000" / "1 250.50". */
export function formatMoney(amount: MoneyInput, currency: Currency): string {
  const scale = scaleOf(currency);
  const value = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('uz-UZ', {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  }).format(value);
}

/** Valyuta belgisi bilan: "12 500 000 so'm" / "$1 250.50". */
export function formatMoneyWithCurrency(amount: MoneyInput, currency: Currency): string {
  const formatted = formatMoney(amount, currency);
  return currency === Currency.USD ? `$${formatted}` : `${formatted} so'm`;
}

/** Kurs ko'rsatishi: 1 USD = N UZS (§3.1). */
export function formatRate(rate: MoneyInput): string {
  const value = typeof rate === 'string' ? Number(rate) : rate;
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: 2 }).format(value);
}
