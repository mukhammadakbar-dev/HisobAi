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
 * sync `storeRate` ni **hech qachon** ustidan yozmaydi.
 *
 * `cbuRate` maydoni §21.5/§14.6 dan keyin bu yerda YO'Q: CBU kursi endi
 * `cbu_rates` — platforma darajasidagi, Shop'lar orasida umumiy jadval.
 * Eski sxema uni shu yerda qo'lda tuzatishga ruxsat berardi — bo'linishdan
 * keyin bu bitta Shop'ning administratori BOSHQA hamma Shop uchun umumiy
 * qatorni yozib qo'yishi degani bo'lardi. `cbuRate` — faqat CBU sync
 * yozadigan ma'lumot, ega uni bu yo'l bilan endi o'zgartira olmaydi.
 */
export const upsertExchangeRateSchema = z
  .object({
    storeRate: positiveRate,
  })
  .strict();
export type UpsertExchangeRateInput = z.infer<typeof upsertExchangeRateSchema>;

/**
 * Ro'yxat filtri: `?from=2026-08-01&to=2026-08-31` (`API.md` §5.2).
 *
 * **Kursor ataylab yo'q.** Kurs tarixi — kuniga bitta qator (§3.3), ya'ni
 * chegaralangan ro'yxat: `limit` (maksimum 200) yetarli va UI 30 tasini
 * so'raydi. Ilgari sxemada `cursor` bor edi, lekin servis uni umuman
 * ishlatmasdi — ya'ni `?cursor=…` jimgina e'tiborsiz qolardi. Bu
 * `API.md` §5.2 ning o'z qoidasini buzardi: noma'lum parametr xato
 * berishi kerak, jimgina yutilmasligi. `.strict()` endi uni rad etadi.
 */
export const exchangeRateQuerySchema = z
  .object({
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
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
 * `POST /exchange-rates/sync` natijasi (§18.4).
 *
 * Ikki natija ataylab ajratilgan: `MANUAL_PRESERVED` — CBU qiymati
 * yangilandi, lekin do'kon kursi qo'lda qo'yilgani uchun daxlsiz qoldi
 * (§16.8). UI shuni aytishi kerak, aks holda ega "yangiladim, lekin
 * kurs o'zgarmadi" degan javobsiz holatga tushadi.
 */
export const ExchangeRateSyncOutcome = {
  /** CBU olindi va do'kon kursi ustama bo'yicha qayta hisoblandi. */
  WRITTEN: 'WRITTEN',
  /** CBU olindi; do'kon kursi `MANUAL` bo'lgani uchun o'zgarmadi. */
  MANUAL_PRESERVED: 'MANUAL_PRESERVED',
} as const;
export type ExchangeRateSyncOutcome =
  (typeof ExchangeRateSyncOutcome)[keyof typeof ExchangeRateSyncOutcome];

export interface SyncExchangeRateResultDto {
  outcome: ExchangeRateSyncOutcome;
  rate: ExchangeRateDto;
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
