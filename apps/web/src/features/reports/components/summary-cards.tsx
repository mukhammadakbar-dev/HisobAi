'use client';

import type { Currency, ReportMetricDto, ReportSummaryDto } from '@hisobai/contracts';
import { TrendingDown, TrendingUp } from 'lucide-react';

import { Money } from '../../../components/money/money';
import { Card } from '../../../components/ui';
import { formatDate } from '../../../lib/format';

/**
 * KPI va foyda tuzilmasi (§13.3, §13.5).
 *
 * Har ko'rsatkich yonida oldingi davr bilan solishtiruv. `null` bo'lsa
 * "—" chiziladi: oldingi davrda qiymat nol bo'lgan va foiz o'zgarishi
 * matematik jihatdan aniqlanmagan (server buni `null` bilan aytadi).
 * "+100%" deb ko'rsatish yolg'on bo'lardi.
 *
 * Foyda **beshta satr** bo'lib ko'rsatiladi (§17.3, §17.12): "sof foyda
 * 3 mln" degan bitta raqam savolga javob bermaydi — ega qaysi xarajat
 * qancha yeganini ko'rishi kerak.
 */
export function SummaryCards({ report }: { report: ReportSummaryDto }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Aylanma" metric={report.revenue} currency={report.currency} emphasis />
        <MetricCard
          label="Yalpi foyda"
          metric={report.profit.grossProfit}
          currency={report.currency}
          emphasis
        />
        <MetricCard
          label="Sof foyda"
          metric={report.profit.netProfit}
          currency={report.currency}
          emphasis
        />
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-lg font-semibold">Foyda tuzilmasi</h2>
          <p className="m-0 text-sm text-text-secondary">
            Solishtiruv: {formatDate(report.previousFrom)} — {formatDate(report.previousTo)}
          </p>
        </div>

        <dl className="m-0 flex flex-col gap-2 text-sm">
          <Line
            label="Yalpi foyda (sotuv − tannarx)"
            metric={report.profit.grossProfit}
            currency={report.currency}
          />
          {/* §17.3 — ustama yalpi foydaga KIRMAYDI, alohida daromad satri */}
          <Line
            label="Nasiya ustamasi"
            metric={report.profit.markupIncome}
            currency={report.currency}
          />
          <Line
            label="Kassa xarajatlari"
            metric={report.profit.cashExpenses}
            currency={report.currency}
            negative
          />
          {/* §17.12 — kassadan pul chiqmaydi, lekin mol do'kondan ketgan */}
          <Line
            label="Pul bo‘lmagan xarajatlar"
            metric={report.profit.nonCashExpenses}
            currency={report.currency}
            negative
          />
          <div className="border-t border-border-default pt-2">
            <Line
              label="Sof foyda"
              metric={report.profit.netProfit}
              currency={report.currency}
              strong
            />
          </div>
        </dl>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  metric,
  currency,
  emphasis,
}: {
  label: string;
  metric: ReportMetricDto;
  currency: Currency;
  emphasis?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className={emphasis ? 'text-2xl font-semibold' : 'text-lg font-semibold'}>
        <Money amount={metric.value} currency={currency} />
      </span>
      <Change metric={metric} currency={currency} />
    </Card>
  );
}

function Line({
  label,
  metric,
  currency,
  negative,
  strong,
}: {
  label: string;
  metric: ReportMetricDto;
  currency: Currency;
  negative?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className={strong ? 'font-semibold' : 'text-text-secondary'}>{label}</dt>
      <dd className="m-0 flex items-baseline gap-3">
        <span className={strong ? 'text-lg font-semibold' : 'font-medium'}>
          {negative && Number(metric.value) > 0 && '−'}
          <Money amount={metric.value} currency={currency} />
        </span>
        <Change metric={metric} currency={currency} />
      </dd>
    </div>
  );
}

/**
 * §13.5 — `+33%` / `−12%`.
 *
 * Rang yagona signal emas: yonida o'q belgisi va foiz matni turadi
 * (`TZ.md` §20 — rang ko'rmaydigan foydalanuvchi ham o'qiy olsin).
 */
function Change({ metric, currency }: { metric: ReportMetricDto; currency: Currency }) {
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
    <span
      className={`inline-flex items-center gap-1 text-xs ${up ? 'text-success' : 'text-danger'}`}
      title={`Oldingi davr: ${metric.previous} ${currency}`}
    >
      <Icon size={14} aria-hidden="true" />
      {up ? '+' : ''}
      {metric.changePercent}%
    </span>
  );
}
