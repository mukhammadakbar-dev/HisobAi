'use client';

import { formatMoneyWithCurrency } from '@hisobai/contracts';
import type { ReportSeriesDto } from '@hisobai/contracts';

/**
 * Savdo va foyda dinamikasi (§13.6).
 *
 * Recharts ATAYLAB ishlatilmaydi — `revenue-chart.tsx` dagi bilan bir
 * xil sabab (`FRONTEND.md` §14: u eng og'ir bog'liqlik). Bu yerda ikki
 * qator ustun kerak, ular uchun kutubxona olib kelish sahifa
 * byudjetining katta qismini bitta blokka sarflash bo'lardi.
 *
 * Foyda **manfiy** bo'lishi mumkin (qaytarish ko'p bo'lgan davr), shuning
 * uchun balandlik moduldan hisoblanadi va manfiy ustun boshqa rangda
 * chiziladi — aks holda u umuman ko'rinmasdi.
 */
export function TrendChart({ series }: { series: ReportSeriesDto }) {
  const peak = series.points.reduce(
    (max, point) =>
      Math.max(max, Math.abs(Number(point.revenue) || 0), Math.abs(Number(point.profit) || 0)),
    0,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-xs text-text-secondary">
        <Legend className="bg-action" label="Aylanma" />
        <Legend className="bg-success" label="Foyda" />
      </div>

      <div className="flex h-40 items-end gap-2 overflow-x-auto" aria-hidden="true">
        {series.points.map((point) => (
          <div key={point.date} className="flex min-w-6 flex-1 items-end gap-0.5 self-stretch">
            <Bar value={Number(point.revenue) || 0} peak={peak} tone="bg-action" />
            <Bar value={Number(point.profit) || 0} peak={peak} tone="bg-success" />
          </div>
        ))}
      </div>

      <div className="flex justify-between text-xs text-text-tertiary" aria-hidden="true">
        <span>{series.points[0]?.date ?? ''}</span>
        <span>{series.points.at(-1)?.date ?? ''}</span>
      </div>

      {/* Grafik ko'rmaydigan foydalanuvchi uchun ayni ma'lumot matnda */}
      <table className="sr-only">
        <caption>Savdo va foyda dinamikasi</caption>
        <thead>
          <tr>
            <th>Sana</th>
            <th>Aylanma</th>
            <th>Foyda</th>
            <th>Savdo soni</th>
          </tr>
        </thead>
        <tbody>
          {series.points.map((point) => (
            <tr key={point.date}>
              <td>{point.date}</td>
              <td>{formatMoneyWithCurrency(point.revenue, series.currency)}</td>
              <td>{formatMoneyWithCurrency(point.profit, series.currency)}</td>
              <td>{point.saleCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Bar({ value, peak, tone }: { value: number; peak: number; tone: string }) {
  // Nolinchi kun ham ko'rinsin: 2% — "kun bor, savdo yo'q" belgisi
  const height = peak > 0 ? Math.max((Math.abs(value) / peak) * 100, 2) : 2;
  const color = value < 0 ? 'bg-danger' : tone;

  return (
    <div className="flex flex-1 items-end self-stretch">
      <div
        className={`w-full rounded-sm ${value === 0 ? 'bg-surface-raised' : color}`}
        style={{ height: `${String(height)}%` }}
      />
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2 w-2 rounded-sm ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}
