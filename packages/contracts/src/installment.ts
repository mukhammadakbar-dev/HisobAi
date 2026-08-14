import type { Currency } from './enums';
import { percentOfMoney, splitMoney, sumMoney, type MoneyInput } from './money';

/**
 * Nasiya hisob-kitobi (§9, §17.3, §17.15).
 *
 * **Nega `contracts` da, ikkala tomon uchun umumiy.** Jadval ekranda
 * tuziladi va serverda tekshiriladi (§9.6 — jadval summasi qarzga teng
 * bo'lishi shart). Ikki joyda ikki xil yozilsa, ega ekranda "hammasi
 * to'g'ri" ni ko'rib tugmani bosadi va server
 * `INSTALLMENT_SCHEDULE_SUM_MISMATCH` bilan rad etadi — hech kim
 * tushuntira olmaydigan holat (`FRONTEND.md` §6.1, `convertMoney` bilan
 * bir xil sabab).
 *
 * Hisob butunlay `money.ts` funksiyalari ustida, ya'ni `BigInt` da
 * (§17.14): `Number` arifmetikasi tiyinni yo'qotib, §9.6 tekshiruvini
 * yolg'on yiqitardi.
 */

/** Jadvalning bitta qatori — sana va o'sha sanaga to'lanadigan summa. */
export interface ScheduleRow {
  /** `YYYY-MM-DD` — kalendar sana (`API.md` §2.2). */
  dueDate: string;
  amount: string;
}

/**
 * Qarz (`principal`) — §17.3.
 *
 * `naqd narx + ustama − boshlang'ich to'lov`. Uchalasi ham shartnoma
 * valyutasida: §9.2 bo'yicha shartnoma valyutasi savdo valyutasiga teng
 * va o'zgarmaydi, ya'ni bu yerda aylantirish umuman bo'lmasligi kerak.
 *
 * Ayirish `sumMoney` orqali: u manfiy qo'shiluvchini ham qabul qiladi va
 * hisob o'sha `BigInt` yo'lida qoladi.
 */
export function principalOf(
  params: { cashPrice: MoneyInput; markupAmount: MoneyInput; downPayment: MoneyInput },
  currency: Currency,
): string {
  const { cashPrice, markupAmount, downPayment } = params;
  return sumMoney([cashPrice, markupAmount, `-${String(downPayment)}`], currency);
}

/**
 * Foizdan ustama summasi (§9.3).
 *
 * Foiz **naqd narxdan** olinadi, qarzdan emas: mijozga aytiladigan gap
 * "narxning 20% i ustama", va boshlang'ich to'lov uni kamaytirmasligi
 * kerak — aks holda ko'proq oldindan to'lagan mijoz kamroq ustama
 * to'lardi va bu §9.3 dagi "naqd narx + ustama" formulasini buzardi.
 */
export function markupFromPercent(
  cashPrice: MoneyInput,
  percent: MoneyInput,
  currency: Currency,
): string {
  return percentOfMoney(cashPrice, percent, currency);
}

/**
 * Oyning kunini keyingi oylarga ko'chirish — §17.15.
 *
 * "31 → fevral" holatida **o'sha oyning oxirgi kuni** olinadi (28 yoki
 * 29). JS `Date` ni o'zi surib yuboradi (31-fevral → 3-mart), ya'ni buni
 * qo'lda ushlash shart: aks holda to'lov sanasi keyingi oyga sirg'alib
 * ketardi va jadval tartibi buzilardi.
 *
 * Hisob UTC da: sana kalendar qiymati (§2.2), ya'ni mahalliy vaqt zonasi
 * unga umuman ta'sir qilmasligi kerak.
 */
export function addMonthsClamped(date: string, months: number): string {
  const [year, month, day] = date.split('-').map((part) => Number.parseInt(part, 10));
  if (year === undefined || month === undefined || day === undefined) {
    throw new TypeError(`Sana YYYY-MM-DD ko'rinishida bo'lsin: ${date}`);
  }

  const target = month - 1 + months;
  const targetYear = year + Math.floor(target / 12);
  const targetMonth = ((target % 12) + 12) % 12;

  // Keyingi oyning 0-kuni = shu oyning oxirgi kuni
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clamped = Math.min(day, lastDay);

  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth + 1).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
}

/**
 * Oylik jadval (§9.5 — avtomatik variant).
 *
 * Summalar `splitMoney` bilan bo'linadi, ya'ni yig'indi qarzga **aynan**
 * teng (§9.6) va yaxlitlash qoldig'i oxirgi qatorda (§17.15).
 *
 * Natija — oddiy qatorlar ro'yxati va u tahrirlanishi mumkin: §9.5
 * "aralash" variant aynan shu — avtomatik tuzilgan jadvalni qo'lda
 * to'g'irlash. Shuning uchun API ham **doim qatorlarni** qabul qiladi,
 * "oylik" degan rejimni emas: server uchun ikkala holat bir xil ko'rinadi
 * va tekshiruv bitta joyda qoladi.
 */
export function generateMonthlySchedule(params: {
  principal: MoneyInput;
  currency: Currency;
  months: number;
  /** Birinchi to'lov sanasi, `YYYY-MM-DD`. */
  firstDueDate: string;
}): ScheduleRow[] {
  const { principal, currency, months, firstDueDate } = params;
  const amounts = splitMoney(principal, months, currency);

  return amounts.map((amount, index) => ({
    dueDate: addMonthsClamped(firstDueDate, index),
    amount,
  }));
}
