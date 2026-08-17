import { z } from 'zod';

import { Currency, PaymentMethod, PaymentStatus } from '../enums';
import {
  calendarDate,
  enumList,
  isoDateTime,
  pageQueryFields,
  positiveDecimal,
  uuidString,
} from './common';
import { fileIdField } from './file';

/**
 * To'lovlar (§10, §12).
 *
 * Uch xil holat qat'iy ajratiladi va faqat bittasi pulga ta'sir qiladi:
 * **`CONFIRMED` to'lov** qarzni kamaytiradi va kassaga tushadi.
 * `PENDING_VERIFICATION` — o'tkazma bildirilgan, lekin hali kelmagan;
 * `REJECTED` — moliyaviy hisobga umuman kirmaydi.
 *
 * Har yozuvda **uchalasi** saqlanadi (§12): haqiqatda berilgan summa va
 * valyutasi, o'sha paytdagi do'kon kursi, qarzdan qancha ayrilgani.
 * Shunda hisob har qanday tekshiruvda qayta tiklanadi — kurs keyin
 * o'zgarsa ham eski to'lov o'z kursida qoladi.
 */

const note = z.string().trim().max(300, 'Izoh 300 belgidan oshmasin').nullable().optional();

/**
 * Nasiya to'lovi (§10).
 *
 * `amount` — **haqiqatda berilgan** summa, o'z valyutasida. Qarzdan
 * qancha ayrilishini server hisoblaydi (§10.5): to'lov SANASIDAGI do'kon
 * kursi bo'yicha shartnoma valyutasiga keltiriladi.
 *
 * §10.2, §16.11 — **ortiqcha to'lov qabul qilinmaydi**: qarz qoldig'idan
 * oshsa server `PAYMENT_EXCEEDS_OUTSTANDING` qaytaradi. "Avans" yoki
 * "mijoz balansi" degan tushuncha yo'q — ortiqcha naqd mijozga qaytim
 * sifatida beriladi va tizimda yozuv qoldirmaydi. Aks holda u kassada
 * qolgan mijoz puli bo'lardi.
 */
export const createPaymentSchema = z
  .object({
    contractId: uuidString,
    amount: positiveDecimal,
    currency: z.enum(Currency),
    method: z.enum(PaymentMethod),
    /** §11.1 — pul qaysi hisobga tushdi; o'tkazmada ham majburiy. */
    cashAccountId: uuidString,
    /** §10.4 — 7 kungacha orqaga qo'yish mumkin; chegara serverda. */
    paidAt: isoDateTime.optional(),
    note,
    /** §15.6, §10.3 — chek surati ixtiyoriy, oldindan yuklangan `RECEIPT`ga havola. */
    receiptFileId: fileIdField,
  })
  .strict();
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

/**
 * Rad etish (§12) — sabab majburiy.
 *
 * Rad etilgan to'lov moliyaviy hisobga umuman kirmaydi, ya'ni oradan
 * vaqt o'tib "nega bu to'lov yo'q" degan savol muqarrar. Sababsiz
 * yozuv unga javob bera olmaydi.
 */
export const rejectPaymentSchema = z
  .object({
    reason: z.string().trim().min(3, 'Sababni yozing').max(300),
  })
  .strict();
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;

/**
 * Qaytarish (§10.6) — teskari kassa yozuvi yaratiladi va qarz tiklanadi.
 *
 * Sabab majburiy: bu amal qarzni **oshiradi**, ya'ni mijoz uchun
 * sezilarli oqibati bor va u audit'da izohsiz qolmasligi kerak.
 */
export const reversePaymentSchema = z
  .object({
    reason: z.string().trim().min(3, 'Sababni yozing').max(300),
  })
  .strict();
export type ReversePaymentInput = z.infer<typeof reversePaymentSchema>;

export const paymentQuerySchema = z
  .object({
    contractId: uuidString.optional(),
    customerId: uuidString.optional(),
    status: enumList(PaymentStatus, 'Kamida bitta holat tanlang').optional(),
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    sort: z.enum(['paidAt', '-paidAt']).default('-paidAt'),
    ...pageQueryFields,
  })
  .strict();
export type PaymentQuery = z.infer<typeof paymentQuerySchema>;

// ──────────────────────────────── Javoblar ────────────────────────────────

/**
 * §10.1 — to'lov qaysi jadval qatorlariga qanday taqsimlangani.
 *
 * Alohida ro'yxat sifatida qaytariladi, chunki u qaytarishni **aniq
 * teskari** bajarish uchun yagona asos (`ARCHITECTURE.md`): qarzni
 * qayta hisoblab emas, aynan shu qatorlarni olib tashlab tiklanadi.
 */
export interface PaymentAllocationDto {
  scheduleId: string;
  sequence: number;
  dueDate: string;
  amount: string;
}

export interface PaymentDto {
  id: string;
  contractId: string | null;
  saleId: string | null;
  customerId: string | null;
  customerName: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  /** §12 — haqiqatda berilgan summa va valyutasi. */
  paidAmount: string;
  paidCurrency: Currency;
  /** §12 — o'sha paytdagi do'kon kursi. */
  exchangeRate: string;
  /** §10.5 — qarzdan qancha ayrildi, shartnoma valyutasida. */
  appliedAmount: string;
  appliedCurrency: Currency;
  cashAccountId: string | null;
  cashAccountName: string | null;
  paidAt: string;
  confirmedAt: string | null;
  rejectedReason: string | null;
  /** §15.6 — `GET /files/:id` orqali vaqtinchalik havola olinadi. */
  receiptFileId: string | null;
  /** §10.6 — bu to'lov qaysi to'lovni qaytargan (teskari yozuvda). */
  reversesPaymentId: string | null;
  allocations: PaymentAllocationDto[];
  createdAt: string;
}
