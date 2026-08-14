'use client';

import type { ReportGranularity } from '@hisobai/contracts';
import Link from 'next/link';
import { useState } from 'react';

import { Money } from '../../../components/money/money';
import { ErrorState, TableSkeleton } from '../../../components/states';
import { Card, Select } from '../../../components/ui';
import { PeriodPicker, defaultPeriod } from '../../../features/reports/components/period-picker';
import { SummaryCards } from '../../../features/reports/components/summary-cards';
import { TopProductsTable } from '../../../features/reports/components/top-products-table';
import { TrendChart } from '../../../features/reports/components/trend-chart';
import {
  useInventoryValue,
  useReportSeries,
  useReportSummary,
  useTopProducts,
} from '../../../features/reports/queries';

/**
 * Hisobotlar (§13).
 *
 * Sahifa **bitta davrga** bo'ysunadi: yuqoridagi tanlov barcha bloklarni
 * boshqaradi. Har blok o'z davriga ega bo'lsa, ekrandagi raqamlar
 * bir-biriga mos kelmay qolardi va qaysi biri qaysi oraliqniki ekanini
 * kuzatib bo'lmasdi.
 *
 * Ombor qiymati esa davrga bog'liq EMAS (§5.9 — bugungi holat), shuning
 * uchun u alohida kartada va buni yozib qo'yamiz.
 */
export default function ReportsPage() {
  const [period, setPeriod] = useState(defaultPeriod);
  const [granularity, setGranularity] = useState<ReportGranularity>('day');

  const summary = useReportSummary(period);
  const series = useReportSeries(period, granularity);
  const topProducts = useTopProducts(period);
  const inventory = useInventoryValue();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-2xl font-semibold">Hisobotlar</h1>
            <p className="m-0 text-sm text-text-secondary">
              Hisobot saqlanmaydi — har safar qaytadan hisoblanadi (§13.10).
            </p>
          </div>
          <Link href="/reports/debts" className="text-sm text-link">
            Qarzdorlar →
          </Link>
        </div>

        <PeriodPicker period={period} onChange={setPeriod} />
      </header>

      {summary.isPending && (
        <Card>
          <TableSkeleton rows={4} />
        </Card>
      )}

      {summary.isError && (
        <Card>
          <ErrorState
            error={summary.error}
            onRetry={() => {
              void summary.refetch();
            }}
          />
        </Card>
      )}

      {summary.isSuccess && <SummaryCards report={summary.data} />}

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-lg font-semibold">Dinamika</h2>
          <Select
            id="granularity"
            aria-label="Qadam"
            value={granularity}
            onChange={(event) => {
              setGranularity(event.target.value as ReportGranularity);
            }}
            className="w-auto"
          >
            <option value="day">Kunlik</option>
            <option value="week">Haftalik</option>
            <option value="month">Oylik</option>
          </Select>
        </div>

        {series.isPending && <TableSkeleton rows={3} />}
        {series.isSuccess && <TrendChart series={series.data} />}
      </Card>

      {topProducts.isSuccess && <TopProductsTable report={topProducts.data} />}

      <Card className="flex flex-col gap-2">
        <h2 className="m-0 text-lg font-semibold">Ombor qiymati</h2>
        {/* §5.9 — bugungi kursda va davrga bog'liq emas: bu hozirgi
            holat, o'tmishdagi ombor qiymati boshqa savol */}
        <p className="m-0 text-sm text-text-secondary">
          Bugungi holat, tannarx bo‘yicha — tanlangan davrga bog‘liq emas (§5.9).
        </p>

        {inventory.isSuccess && (
          <>
            <div className="text-2xl font-semibold">
              <Money amount={inventory.data.totalCost} currency={inventory.data.currency} />
            </div>
            <p className="m-0 text-sm text-text-secondary">
              {inventory.data.serializedCount} ta birlik · {inventory.data.batchQuantity} dona
              partiyada
            </p>
            {/* Kurs yo'qligi jimgina nolga aylanmaydi */}
            {inventory.data.rateMissing && (
              <p className="m-0 rounded-md bg-warning-bg p-3 text-sm text-warning">
                Valyuta kursi yo‘q — dollardagi mol baholanmadi. Sozlamalarda kursni kiriting.
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
