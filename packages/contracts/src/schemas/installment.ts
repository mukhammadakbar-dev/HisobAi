import { z } from 'zod';

import { PaymentMethod } from '../enums';
import type { ContractStatus, Currency, ScheduleStatus } from '../enums';
import { calendarDate, decimalInRange, decimalString, positiveDecimal, uuidString } from './common';

/**
 * Nasiya (§9, §11).
 *
 * Shartnoma **savdo tasdiqlanganda o'sha tranzaksiya ichida** yaratiladi
 * (§9.1), ya'ni alohida "shartnoma yaratish" endpointi yo'q va bo'lmaydi:
 * shartnomasiz nasiya savdo — qarzni hech qayerda qoldirmasdan yo'qotgan
 * savdo. Shu sababdan bu yerdagi asosiy sxema —
 * `installmentPlanSchema` — `confirmSaleSchema` ning ichiga kiradi.
 *
 * Jadval **doim qatorlar ro'yxati** bo'lib uzatiladi, "oylik" degan rejim
 * emas. §9.5 uch xil usulni sanaydi (avtomatik, qo'lda, aralash), lekin
 * ular faqat qatorlar QAYERDA tuzilishi bilan farq qiladi: avtomatik
 * variantda ularni `generateMonthlySchedule` (contracts) tuzadi va
 * foydalanuvchi tahrirlaydi. Server uchun uchalasi bir xil ko'rinadi,
 * ya'ni §9.6 tekshiruvi bitta joyda qoladi.
 */

const note = z.string().trim().max(300, 'Izoh 300 belgidan oshmasin').nullable().optional();

/** Jadvalning bitta qatori (§9.5). */
export const scheduleRowInputSchema = z
  .object({
    dueDate: calendarDate,
    amount: positiveDecimal,
  })
  .strict();
export type ScheduleRowInput = z.infer<typeof scheduleRowInputSchema>;

/**
 * Nasiya sharti — `confirmSaleSchema` ichida (§9.1).
 *
 * Ustama **yo summa, yo foiz** (§9.3): ikkalasi birdan yuborilsa qaysi
 * biri haqiqiy ekani noaniq bo'lardi va server bilan ekran har xil
 * javob berishi mumkin edi. Foizdan summa `markupFromPercent` bilan
 * hisoblanadi — ikkala tomonda bir xil funksiya.
 *
 * `downPayment` **0 bo'lishi mumkin** (§16.3): ekran ogohlantiradi,
 * lekin taqiqlamaydi — bu do'kon egasining biznes qarori, tizimning
 * emas.
 */
export const installmentPlanSchema = z
  .object({
    /** §16.3 — 0 ham to'g'ri qiymat. */
    downPayment: decimalString
      .refine((value) => Number(value) >= 0, { message: "Boshlang'ich to'lov manfiy bo'lmaydi" })
      .default('0'),
    markupAmount: decimalString
      .refine((value) => Number(value) >= 0, { message: 'Ustama manfiy bo‘lmaydi' })
      .optional(),
    markupPercent: decimalInRange(0, 100, 'Ustama foizi 0–100 oralig‘ida bo‘lsin').optional(),
    schedule: z
      .array(scheduleRowInputSchema)
      .min(1, 'Jadvalda kamida bitta qator bo‘lsin')
      .max(120, 'Jadval 120 qatordan oshmasin'),
  })
  .strict()
  .refine((plan) => plan.markupAmount === undefined || plan.markupPercent === undefined, {
    message: 'Ustamani yo summa, yo foiz bilan bering',
    path: ['markupPercent'],
  })
  // Qatorlar sanasi o'sib borishi shart: aks holda "eng eski to'lanmagan
  // qatordan boshlab taqsimlash" (§10.1) tartibi ma'nosini yo'qotardi
  .refine(
    (plan) =>
      plan.schedule.every(
        (row, index) => index === 0 || row.dueDate >= (plan.schedule[index - 1]?.dueDate ?? ''),
      ),
    { message: 'Jadval sanalari o‘sib borishi kerak', path: ['schedule'] },
  );
export type InstallmentPlanInput = z.infer<typeof installmentPlanSchema>;

/**
 * Jadvalni qayta tuzish (§9.10, §9.11).
 *
 * **Faqat to'lanmagan qatorlar** almashtiriladi — to'langan yoki qisman
 * to'langan qatorga tegib bo'lmaydi (§9.10). Umumiy qarz o'zgarmaydi:
 * server yangi qatorlar yig'indisini qolgan qarz bilan solishtiradi
 * (§9.11), ya'ni bu amal faqat sanalar va summalar TAQSIMOTINI
 * o'zgartiradi.
 *
 * Sabab majburiy: qayta tuzish audit'ga sababi bilan yoziladi (§9.11).
 */
export const rebuildScheduleSchema = z
  .object({
    schedule: z.array(scheduleRowInputSchema).min(1).max(120),
    reason: z.string().trim().min(3, 'Sababni yozing').max(300),
  })
  .strict();
export type RebuildScheduleInput = z.infer<typeof rebuildScheduleSchema>;

/**
 * Erta yopish (§9.12).
 *
 * Qolgan summa **serverda** hisoblanadi va shu yerda tasdiqlanadi:
 * client yuborgan summaga ishonib bo'lmaydi (§25.13 bilan bir mantiq).
 * `expectedOutstanding` — ekranda ko'rsatilgan qoldiq; server undan
 * farq qilsa amalni rad etadi, ya'ni ega o'zi ko'rgan summadan boshqa
 * summani jimgina to'lab qo'ymaydi.
 */
export const closeContractSchema = z
  .object({
    expectedOutstanding: decimalString,
    method: z.enum(PaymentMethod),
    cashAccountId: uuidString,
    note,
  })
  .strict();
export type CloseContractInput = z.infer<typeof closeContractSchema>;

// ──────────────────────────────── Javoblar ────────────────────────────────

export interface PaymentScheduleDto {
  id: string;
  sequence: number;
  dueDate: string;
  amountDue: string;
  /** §17.4 bilan bir mantiq — kesh; haqiqat manbai `payment_allocations`. */
  amountPaid: string;
  status: ScheduleStatus;
  /**
   * §9.8 — **saqlanmaydi, hisoblanadi**: `dueDate < bugun` va qarz
   * qolgan. Serverda hisoblanadi, chunki "bugun" do'kon vaqt zonasida
   * aniqlanadi (§1.3) va brauzer zonasi undan farq qilishi mumkin.
   */
  isOverdue: boolean;
}

export interface InstallmentContractDto {
  id: string;
  saleId: string;
  saleNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  currency: Currency;
  /** §17.3 — naqd narx (ustamasiz), savdo summasiga teng. */
  cashPrice: string;
  markupAmount: string;
  markupPercent: string | null;
  downPayment: string;
  /** §17.3 — naqd narx + ustama − boshlang'ich to'lov. */
  principal: string;
  /**
   * Qolgan qarz — jadval qatorlaridan hisoblanadi:
   * `Σ(amountDue − amountPaid)`. Ustun sifatida **saqlanmaydi**:
   * hisoblanadigan qiymat saqlanmaydi degan qoida (`ARCHITECTURE.md`),
   * aks holda u jadval bilan farq qilib qolardi va qaysi biri to'g'ri
   * ekani noma'lum bo'lardi.
   *
   * `amountPaid` ning o'zi ham kesh, haqiqat manbai —
   * `payment_allocations`; u faqat to'lov tranzaksiyasi ichida
   * yangilanadi, ya'ni ikkalasi hech qachon ajralib ketmaydi.
   */
  outstanding: string;
  status: ContractStatus;
  closedAt: string | null;
  schedules: PaymentScheduleDto[];
  createdAt: string;
}
