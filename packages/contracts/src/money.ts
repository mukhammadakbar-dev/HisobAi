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

  return fromMinorUnits(negative ? -magnitude : magnitude, scale);
}

/**
 * Yig'indi — **butunlay `BigInt` ustida** (§17.14).
 *
 * Nega alohida funksiya: `Number(a) + Number(b)` bilan hisoblangan
 * jami, keyin serverdagi `Decimal` yig'indisidan farq qilib qolardi.
 * Foydalanuvchi ekranda bir raqamni, chekda esa boshqasini ko'radi va
 * qaysi biri to'g'ri ekanini bilmaydi. Har qo'shiluvchi avval o'z
 * valyutasi bo'yicha yaxlitlanadi — bazaga ham aynan shunday yoziladi.
 */
export function sumMoney(amounts: readonly MoneyInput[], currency: Currency): string {
  const scale = scaleOf(currency);

  let total = 0n;
  for (const amount of amounts) {
    total += toMinorUnits(roundMoney(amount, currency));
  }
  return fromMinorUnits(total, scale);
}

/**
 * Butun songa ko'paytirish — partiya jami tannarxi (miqdor × donasiga).
 *
 * `factor` butun son bo'lishi shart: partiyada yarim dona bo'lmaydi va
 * kasr ko'paytuvchi yaxlitlash qoidasini talab qilardi — u esa bu
 * yerda ataylab yo'q.
 */
export function multiplyMoney(amount: MoneyInput, factor: number, currency: Currency): string {
  if (!Number.isSafeInteger(factor)) {
    throw new TypeError(`Ko'paytuvchi butun son bo'lishi kerak: ${String(factor)}`);
  }
  const scale = scaleOf(currency);
  return fromMinorUnits(toMinorUnits(roundMoney(amount, currency)) * BigInt(factor), scale);
}

/**
 * Summani teng bo'laklarga bo'lish — **yaxlitlash qoldig'i OXIRGI
 * bo'lakka** (§17.15).
 *
 * Nasiya jadvali uchun yozilgan, lekin qoida umumiy: bo'laklar
 * yig'indisi butunga **aynan** teng bo'lishi shart. §9.6 jadval
 * summasini qarzga tenglikka tekshiradi, ya'ni har bo'lakni alohida
 * yaxlitlash (`total / n` ni n marta) tekshiruvni tiyinlar tufayli
 * yiqitardi: 100 UZS ni 3 ga bo'lganda 33+33+33 = 99.
 *
 * Qoldiq aynan OXIRGI qatorga qo'shiladi, birinchisiga emas: mijoz
 * birinchi to'lovni eng erta ko'radi va u "notekis" bo'lsa savol
 * tug'diradi; oxirgisi esa jadval tuzilgandan keyin baribir
 * tekshiriladigan qator.
 *
 * Manfiy summa qabul qilinmaydi — bo'lish faqat qarz taqsimotida
 * ishlatiladi va u har doim musbat.
 */
export function splitMoney(total: MoneyInput, parts: number, currency: Currency): string[] {
  if (!Number.isSafeInteger(parts) || parts <= 0) {
    throw new TypeError(`Bo'laklar soni musbat butun son bo'lishi kerak: ${String(parts)}`);
  }

  const scale = scaleOf(currency);
  const minor = toMinorUnits(roundMoney(total, currency));
  if (minor < 0n) {
    throw new TypeError("Manfiy summani bo'lib bo'lmaydi");
  }

  const count = BigInt(parts);
  const base = minor / count;
  const remainder = minor - base * count;

  return Array.from({ length: parts }, (_, index) =>
    fromMinorUnits(index === parts - 1 ? base + remainder : base, scale),
  );
}

/**
 * Summaning foizi — nasiya ustamasi uchun (§9.3).
 *
 * Foiz `Decimal(5,2)`, ya'ni ikkita kasr xonagacha (`12.50%`). Hisob
 * `BigInt` da: `amount * percent / 100` ni `Number` bilan qilish
 * ustamani tiyinga xato hisoblardi va u to'g'ridan-to'g'ri qarzga
 * (§17.3) o'tib ketardi. Yaxlitlash ROUND_HALF_UP — `roundMoney` bilan
 * bir xil.
 */
export function percentOfMoney(
  amount: MoneyInput,
  percent: MoneyInput,
  currency: Currency,
): string {
  const scale = scaleOf(currency);
  const minor = toMinorUnits(roundMoney(amount, currency));

  // Foizni yuzdan bir ulushigacha butun songa keltiramiz: 12.5 → 1250
  const { negative, intDigits, fracDigits } = parseDecimal(percent);
  if (negative) {
    throw new TypeError(`Ustama foizi manfiy bo'lmasligi kerak: ${String(percent)}`);
  }
  const percentMinor = BigInt(`${intDigits}${fracDigits.padEnd(2, '0').slice(0, 2)}`);

  // Bo'luvchi: 100 (foiz) × 100 (foizning kasr xonalari)
  const scaled = minor * percentMinor;
  const divisor = 10_000n;
  const quotient = scaled / divisor;
  const twiceRemainder = (scaled - quotient * divisor) * 2n;

  return fromMinorUnits(twiceRemainder >= divisor ? quotient + 1n : quotient, scale);
}

/**
 * Valyutalar orasida aylantirish — do'kon kursi bo'yicha (§1.7, §1.9).
 *
 * Nega `contracts` da: bu qoida **ikkala tomonda ham** kerak. Server uni
 * to'lovni savdo valyutasiga keltirishda ishlatadi (§17.10 tekshiruvi),
 * savdo formasi esa "qancha qoldi" ni ekranda ko'rsatishda. Ikki joyda
 * ikki xil yozilsa, ega "qoldi: 0" ni ko'rib tugmani bosadi va server
 * `SALE_PAYMENT_MISMATCH` bilan rad etadi — hech kim tushuntira
 * olmaydigan holat (`FRONTEND.md` §6.1).
 *
 * Hisob butunlay `BigInt` ustida: kurs `Decimal(12,4)`, ya'ni to'rt kasr
 * xona. Bo'lishda yaxlitlash ROUND_HALF_UP bo'lib, natija valyutaning
 * o'z aniqligiga keltiriladi — `roundMoney` bilan bir xil usul.
 */
export function convertMoney(
  amount: MoneyInput,
  from: Currency,
  to: Currency,
  rate: MoneyInput,
): string {
  if (from === to) return roundMoney(amount, to);

  const fromScale = scaleOf(from);
  const toScale = scaleOf(to);
  const source = toMinorUnits(roundMoney(amount, from));
  const rateMinor = rateToMinorUnits(rate);
  if (rateMinor <= 0n) {
    throw new RangeError(`Kurs musbat bo'lishi kerak: ${String(rate)}`);
  }

  // UZS ga — kursga ko'paytiriladi, USD ga — bo'linadi (§3.1).
  // Ikkala yo'lda ham natija `to` valyutasining eng kichik birligida
  // ifodalanadi, shuning uchun umumiy kasr sifatida yoziladi:
  //   result = (source × 10^-fromScale) × rate^±1 × 10^toScale
  const toUzs = to !== Currency.USD;
  const numerator = toUzs
    ? source * rateMinor * 10n ** BigInt(toScale)
    : source * 10n ** BigInt(toScale + RATE_SCALE);
  const denominator = toUzs
    ? 10n ** BigInt(fromScale + RATE_SCALE)
    : rateMinor * 10n ** BigInt(fromScale);

  return fromMinorUnits(divideHalfUp(numerator, denominator), toScale);
}

/** Kurs ustunining kasr xonalari — `exchange_rates.store_rate` `Decimal(12,4)`. */
const RATE_SCALE = 4;

function rateToMinorUnits(rate: MoneyInput): bigint {
  const { negative, intDigits, fracDigits } = parseDecimal(rate);
  // Kursda to'rtdan ortiq xona bo'lsa — bazadagi ustun qoidasi bo'yicha
  // kesiladi, chunki savdoda AYNAN saqlangan qiymat ishlatiladi (§1.7)
  const digits = `${intDigits}${fracDigits.padEnd(RATE_SCALE, '0').slice(0, RATE_SCALE)}`;
  const magnitude = BigInt(digits);
  return negative ? -magnitude : magnitude;
}

/** ROUND_HALF_UP bo'lish — `roundMoney` bilan bir xil usul (yarmi noldan uzoqlashadi). */
function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const quotient = (magnitude * 2n + denominator) / (denominator * 2n);
  return negative ? -quotient : quotient;
}

/**
 * Yaxlitlangan satrni eng kichik birlikka (tiyin/sent) o'tkazadi.
 *
 * Kirish AYNAN `roundMoney` natijasi bo'lishi shart — u har doim `scale`
 * ta kasr xona beradi, shuning uchun nuqtani olib tashlash yetarli.
 */
function toMinorUnits(rounded: string): bigint {
  const negative = rounded.startsWith('-');
  const magnitude = BigInt((negative ? rounded.slice(1) : rounded).replace('.', ''));
  return negative ? -magnitude : magnitude;
}

/** Eng kichik birlikdan satrga — har doim aynan `scale` ta kasr xona. */
function fromMinorUnits(value: bigint, scale: number): string {
  // `-0n === 0n`, ya'ni "-0" / "-0.00" o'z-o'zidan chiqmaydi
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  const wholePart = scale === 0 ? digits : digits.slice(0, digits.length - scale);
  const fracPart = scale === 0 ? '' : digits.slice(digits.length - scale);

  const body = scale === 0 ? wholePart : `${wholePart}.${fracPart}`;
  return negative ? `-${body}` : body;
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
