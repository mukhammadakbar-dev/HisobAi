import { CURRENCY_SCALE, Currency } from './enums';

/**
 * Pul bilan ishlash yordamchilari.
 *
 * MUHIM (ARCHITECTURE §4, §17.14): pul hisobi HECH QACHON `float` bilan
 * qilinmaydi. Bu fayldagi hech bir funksiya ichida `Number` arifmetikasi
 * yo'q — hammasi `BigInt` va satr ustida ishlaydi.
 *
 * Nega bu muhim: yaxlitlash — bu HISOB, formatlash emas. ARCHITECTURE §4
 * o'zi aytadi: "yaxlitlash yozishdan oldin qilinadi, ko'rsatishda emas".
 * Ilgari `roundMoney` `Number(x).toFixed(scale)` qilardi va binar float
 * xatosiga uchrardi: `(1.005).toFixed(2) === "1.00"`. Bunday xatolar
 * jamlanib, `payment_allocations` yig'indisi `amount_due` ga teng bo'lmay
 * qolardi va §9.6 tekshiruvi yolg'on xato berardi.
 *
 * Serverda pul manbai — Prisma `Decimal`; uning `.toString()` natijasi shu
 * funksiyalarga kiritiladi. `number` ham qabul qilinadi, lekin u allaqachon
 * aniqlikni yo'qotgan bo'lishi mumkin — iloji boricha satr uzating.
 */

export type MoneyInput = string | number;

/** §1.10 — UZS butun songacha, USD 2 kasr xonagacha. */
export function scaleOf(currency: Currency): number {
  return CURRENCY_SCALE[currency];
}

/** UZS uchun minglik ajratgich — uzilmaydigan probel (raqam qatorga bo'linmasin). */
const THOUSANDS_SEPARATOR = ' ';

interface ParsedDecimal {
  negative: boolean;
  intDigits: string;
  fracDigits: string;
}

/**
 * Eksponensial shaklni oddiy o'nlik satrga yoyadi: `"1e+21"` → `"1000…0"`.
 *
 * Prisma `Decimal.toString()` bizdagi kattaliklarda (Decimal(18,2)) buni
 * bermaydi, lekin `number` uchun `String(1e21)` aynan shunday chiqadi —
 * shuning uchun ikkala kirish uchun ham bir joyda normallashtiriladi.
 */
function expandExponential(text: string): string {
  if (!text.includes('e') && !text.includes('E')) return text;

  const [mantissa = '', exponentText = ''] = text.split(/[eE]/);
  if (!/^[+-]?\d+$/.test(exponentText)) {
    throw new TypeError(`Pul qiymati noto'g'ri: ${text}`);
  }
  const exponent = Number.parseInt(exponentText, 10);
  const negative = mantissa.startsWith('-');
  const unsigned = mantissa.replace(/^[+-]/, '');
  const digits = unsigned.replace('.', '');
  const pointIndex = (unsigned.split('.')[0] ?? '').length + exponent;

  let result: string;
  if (pointIndex <= 0) {
    result = `0.${'0'.repeat(-pointIndex)}${digits}`;
  } else if (pointIndex >= digits.length) {
    result = digits + '0'.repeat(pointIndex - digits.length);
  } else {
    result = `${digits.slice(0, pointIndex)}.${digits.slice(pointIndex)}`;
  }
  return negative ? `-${result}` : result;
}

function parseDecimal(amount: MoneyInput): ParsedDecimal {
  if (typeof amount === 'number' && !Number.isFinite(amount)) {
    throw new TypeError(`Pul qiymati son emas: ${String(amount)}`);
  }
  const text = expandExponential(String(amount).trim());
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match) {
    throw new TypeError(`Pul qiymati noto'g'ri: ${String(amount)}`);
  }
  const intDigits = match[2] ?? '';
  const fracDigits = match[3] ?? '';
  // Na butun, na kasr qismi bor — masalan "" yoki "."
  if (intDigits === '' && fracDigits === '') {
    throw new TypeError(`Pul qiymati noto'g'ri: ${String(amount)}`);
  }
  return {
    negative: match[1] === '-',
    intDigits: intDigits === '' ? '0' : intDigits,
    fracDigits,
  };
}

/**
 * Summani valyuta qoidasi bo'yicha yaxlitlaydi va satr qaytaradi.
 *
 * Usul — ROUND_HALF_UP (yarmi noldan uzoqlashadi), `Decimal.ROUND_HALF_UP`
 * bilan bir xil. Natija satr: uni yana `Decimal`ga aylantirib bazaga yozish
 * mumkin, oraliqda `number` bo'lib qolmaydi.
 *
 * Natijada har doim AYNAN `scale` ta kasr xona bo'ladi:
 *   roundMoney('1.005', 'USD') → '1.01'
 *   roundMoney('12500.6', 'UZS') → '12501'
 */
export function roundMoney(amount: MoneyInput, currency: Currency): string {
  const scale = scaleOf(currency);
  const { negative, intDigits, fracDigits } = parseDecimal(amount);

  // Yaxlitlash uchun kerakli kasr xonalar + tekshiriladigan bitta xona
  const padded = fracDigits.padEnd(scale + 1, '0');
  const kept = `${intDigits}${padded.slice(0, scale)}`;
  const nextDigit = padded.charCodeAt(scale) - 48; // '0' = 48

  let magnitude = BigInt(kept);
  if (nextDigit >= 5) magnitude += 1n;

  const asText = magnitude.toString().padStart(scale + 1, '0');
  const wholePart = scale === 0 ? asText : asText.slice(0, asText.length - scale);
  const fracPart = scale === 0 ? '' : asText.slice(asText.length - scale);

  const body = scale === 0 ? wholePart : `${wholePart}.${fracPart}`;
  // "-0" / "-0.00" bo'lmasin
  const isZero = magnitude === 0n;
  return negative && !isZero ? `-${body}` : body;
}

/** Ichki: butun qismga minglik ajratgich qo'yadi. */
function groupThousands(digits: string): string {
  let result = '';
  for (let index = digits.length; index > 0; index -= 3) {
    const start = Math.max(0, index - 3);
    result = digits.slice(start, index) + (result ? THOUSANDS_SEPARATOR + result : '');
  }
  return result || '0';
}

/**
 * O'zbekcha ko'rinishda formatlaydi: "12 500 000" / "1 250.50".
 *
 * `Intl.NumberFormat` ATAYLAB ishlatilmaydi: to'liq ICU'siz Node muhitida
 * `uz-UZ` lokali `en-US` ga tushib qoladi va ajratgich vergul bo'lib
 * ketadi ("12,500,000"). Bu yerdagi guruhlash muhitdan mustaqil.
 */
export function formatMoney(amount: MoneyInput, currency: Currency): string {
  let rounded: string;
  try {
    rounded = roundMoney(amount, currency);
  } catch {
    return '—';
  }
  const negative = rounded.startsWith('-');
  const [wholePart, fracPart] = rounded.replace('-', '').split('.');
  const grouped = groupThousands(wholePart ?? '0');
  const body = fracPart ? `${grouped}.${fracPart}` : grouped;
  return negative ? `−${body}` : body; // U+2212 minus — tire emas
}

/** Valyuta belgisi bilan: "12 500 000 so'm" / "$1 250.50". */
export function formatMoneyWithCurrency(amount: MoneyInput, currency: Currency): string {
  const formatted = formatMoney(amount, currency);
  if (formatted === '—') return formatted;
  if (currency !== Currency.USD) return `${formatted} so'm`;
  return formatted.startsWith('−') ? `−$${formatted.slice(1)}` : `$${formatted}`;
}

/** Kurs ko'rsatishi: 1 USD = N UZS (§3.1). Maksimum 2 kasr xona. */
export function formatRate(rate: MoneyInput): string {
  let parsed: ParsedDecimal;
  try {
    parsed = parseDecimal(rate);
  } catch {
    return '—';
  }
  // Kursni USD qoidasida (2 xona) yaxlitlaymiz, so'ng ortiqcha nollarni olib tashlaymiz
  const rounded = roundMoney(rate, Currency.USD);
  const negative = rounded.startsWith('-');
  const [wholePart, fracPart = ''] = rounded.replace('-', '').split('.');
  const trimmedFrac = fracPart.replace(/0+$/, '');
  const grouped = groupThousands(wholePart ?? '0');
  const body = trimmedFrac ? `${grouped}.${trimmedFrac}` : grouped;
  return negative && parsed.negative ? `−${body}` : body;
}
