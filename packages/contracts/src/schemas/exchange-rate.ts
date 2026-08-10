import { z } from 'zod';

import type { ExchangeRateSource } from '../enums';
import type { RateStaleness } from '../rates';
import { calendarDate, decimalString } from './common';

/**
 * Valyuta kursi (§3.1–§3.5, §16.2, §16.6, §16.8).
 *
 * Ikki kurs saqlanadi: `cbuRate` — ma'lumot uchun, `storeRate` — savdo va
 * to'lovlarda AYNAN shu ishlatiladi.
 */

const positiveRate = decimalString.refine((value) => Number(value) > 0, {
  message: "Kurs musbat bo'lishi kerak",
});

/**
 * `PUT /exchange-rates/:date` — kursni qo'lda qo'yish.
 *
 * §16.8 — bu amal `source` ni `MANUAL` ga o'tkazadi va shundan keyin CBU
 * sync `storeRate` ni **hech qachon** ustidan yozmaydi. `cbuRate` esa
 * ma'lumot uchun yangilanib turaveradi.
 */
export const upsertExchangeRateSchema = z
  .object({
    storeRate: positiveRate,
    /** Odatda avtomatik keladi; qo'lda tuzatish ham mumkin. */
    cbuRate: positiveRate.nullable().optional(),
  })
  .strict();
export type UpsertExchangeRateInput = z.infer<typeof upsertExchangeRateSchema>;

/** Ro'yxat filtri: `?from=2026-08-01&to=2026-08-31` (`API.md` §5.2). */
export const exchangeRateQuerySchema = z
  .object({
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
    cursor: z.string().optional(),
  })
  .strict();
export type ExchangeRateQuery = z.infer<typeof exchangeRateQuerySchema>;

export interface ExchangeRateDto {
  id: string;
  /** Kalendar sana, `YYYY-MM-DD` (`API.md` §2.2). */
  date: string;
  /** Olinmagan bo'lsa `null` — kurs yo'qligi savdoni to'xtatmaydi (§1.5). */
  cbuRate: string | null;
  storeRate: string;
  source: ExchangeRateSource;
  fetchedAt: string | null;
  updatedById: string | null;
  updatedAt: string;
}

/**
 * `GET /exchange-rates/today` javobi.
 *
 * §1.5, §3.4 — kurs eskirsa savdo TO'XTAMAYDI: oxirgi ma'lum kurs
 * qaytariladi, UI esa tepada ogohlantirish chizig'ini ko'rsatadi.
 */
export interface TodayExchangeRateDto {
  /** Do'kon zonasidagi bugungi sana. */
  today: string;
  /** Bugun uchun qator bo'lmasa — oxirgi ma'lum kurs (`null` ham bo'lishi mumkin). */
  rate: ExchangeRateDto | null;
  /** §16.6 — bugungi sana uchun qator yo'qmi. */
  isStale: boolean;
  /** Amaldagi kurs necha kun eski. Kurs umuman bo'lmasa `null`. */
  staleDays: number | null;
  staleness: RateStaleness;
}
