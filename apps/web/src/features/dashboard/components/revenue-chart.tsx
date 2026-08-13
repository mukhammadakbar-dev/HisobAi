'use client';

import { formatMoneyWithCurrency } from '@hisobai/contracts';
import type { Currency, DashboardChartPointDto } from '@hisobai/contracts';

/**
 * Kunlik tushum grafigi (§14.4).
 *
 * Recharts ataylab ishlatilmaydi: `FRONTEND.md` §14 uni eng og'ir
 * bog'liqlik deb belgilaydi va dashboard JS byudjeti 200 KB (gzip).
 * Bu yerdagi grafik — o'n to'rtta ustun, ular uchun kutubxona olib
 * kelish byudjetning yarmini bitta blokka sarflash bo'lardi.
 * `/reports` dagi murakkab grafiklar uchun Recharts o'z o'rnida qoladi.
 *
 * Balandlik `Number()` bilan hisoblanadi va bu xavfsiz: u faqat
 * **nisbat** — ko'rsatiladigan summa har doim satrdan formatlanadi
 * (`API.md` §2.1).
 */
export function RevenueChart({
  points,
  currency,
}: {
  points: DashboardChartPointDto[];
  currency: Currency;
}) {
  const max = points.reduce((peak, point) => Math.max(peak, Number(point.revenue) || 0), 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-32 items-end gap-1" aria-hidden="true">
        {points.map((point) => {
          const value = Number(point.revenue) || 0;
          // Nolinchi kun ham ko'rinsin: 2% — "kun bor, savdo yo'q" belgisi
          const height = max > 0 ? Math.max((value / max) * 100, 2) : 2;

          return (
            <div key={point.date} className="flex flex-1 items-end self-stretch">
              <div
                className={`w-full rounded-sm ${value > 0 ? 'bg-action' : 'bg-surface-raised'}`}
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-between text-xs text-text-tertiary" aria-hidden="true">
        <span>{dayLabel(points[0]?.date)}</span>
        <span>{dayLabel(points[points.length - 1]?.date)}</span>
      </div>

      {/* Grafik ko'rmaydigan foydalanuvchi uchun ayni ma'lumot matnda */}
      <ul className="sr-only">
        {points.map((point) => (
          <li key={point.date}>
            {point.date}: {formatMoneyWithCurrency(point.revenue, currency)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** `"2026-08-12"` → `"12.08"`. */
function dayLabel(date: string | undefined): string {
  if (!date) return '';
  const [, month, day] = date.split('-');
  return month && day ? `${day}.${month}` : date;
}
