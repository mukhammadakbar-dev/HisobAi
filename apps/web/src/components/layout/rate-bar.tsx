'use client';

import { RateStaleness, formatRate } from '@hisobai/contracts';
import type { TodayExchangeRateDto } from '@hisobai/contracts';
import { AlertTriangle } from 'lucide-react';

/**
 * Bugungi kurs va eskirganlik chizig'i (§14.5, §16.6).
 *
 * §1.5 — kurs eskirsa **savdo to'xtamaydi**: oxirgi ma'lum kurs
 * ishlatiladi. Shuning uchun bu blok hech narsani bloklamaydi, faqat
 * haqiqatni ochiq aytadi. Rang yagona signal emas (TZ §20): matn ham,
 * ikonka ham bor.
 */
const TONE: Record<RateStaleness, string> = {
  [RateStaleness.FRESH]: 'border-border-default bg-surface-card text-text-secondary',
  [RateStaleness.WARN]: 'border-warning-bg bg-warning-bg text-warning',
  [RateStaleness.CRITICAL]: 'border-danger-bg bg-danger-bg text-danger',
};

export function RateBar({ data }: { data: TodayExchangeRateDto | undefined }) {
  if (!data) return null;

  const { rate, staleness, staleDays } = data;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-sm ${TONE[staleness]}`}
      role={staleness === RateStaleness.FRESH ? undefined : 'status'}
    >
      {staleness !== RateStaleness.FRESH && <AlertTriangle size={16} aria-hidden="true" />}

      {rate ? (
        <>
          <span>
            Do‘kon kursi: <strong className="tabular">{formatRate(rate.storeRate)}</strong> so‘m
          </span>
          <span className="text-text-tertiary">
            CBU: <span className="tabular">{rate.cbuRate ? formatRate(rate.cbuRate) : '—'}</span>
          </span>
          {staleness !== RateStaleness.FRESH && (
            <span className="font-medium">
              Kurs {staleDays} kun eskirgan ({rate.date}). Sozlamalarda yangilang.
            </span>
          )}
        </>
      ) : (
        <span className="font-medium">
          Valyuta kursi hali kiritilmagan. Sozlamalar → Valyuta bo‘limida qo‘shing.
        </span>
      )}
    </div>
  );
}
