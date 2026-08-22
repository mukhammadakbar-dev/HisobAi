'use client';

import type { ReportMetricDto } from '@hisobai/contracts';
import { TrendingDown, TrendingUp } from 'lucide-react';

/**
 * KPI plitasidagi "avvalgi davrga nisbatan" satri.
 *
 * `reports/summary-cards.tsx` dagi `Change` bilan bir mantiq
 * (`changePercent === null` — "—", chunki oldingi davr nol bo'lganda
 * foiz matematik jihatdan aniqlanmaydi), faqat qiyoslov so'zi
 * (`comparisonLabel`) davrga qarab almashadi.
 */
export function MetricDelta({
  metric,
  comparisonLabel,
}: {
  metric: ReportMetricDto;
  comparisonLabel: string;
}) {
  if (metric.changePercent === null) {
    return (
      <span className="text-xs text-text-tertiary" title="Oldingi davrda qiymat yo‘q edi">
        —
      </span>
    );
  }

  const up = metric.changePercent >= 0;
  const Icon = up ? TrendingUp : TrendingDown;

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${up ? 'text-success' : 'text-danger'}`}>
      <Icon size={13} aria-hidden="true" />
      {up ? '+' : ''}
      {metric.changePercent}% {comparisonLabel}
    </span>
  );
}
