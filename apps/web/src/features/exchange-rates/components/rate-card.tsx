'use client';

import {
  ExchangeRateSource,
  ExchangeRateSyncOutcome,
  RateStaleness,
  formatRate,
} from '@hisobai/contracts';
import { RefreshCw } from 'lucide-react';

import { ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Button, Card } from '../../../components/ui';
import { FormError } from '../../auth/components/form-error';
import { useRateHistory, useSyncRateFromCbu, useTodayRate } from '../queries';

const SOURCE_LABEL: Record<ExchangeRateSource, string> = {
  [ExchangeRateSource.CBU]: 'CBU',
  [ExchangeRateSource.MANUAL]: "Qo'lda",
};

export function RateCard() {
  const today = useTodayRate();
  const history = useRateHistory();
  const syncNow = useSyncRateFromCbu();

  const rate = today.data?.rate ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-lg font-semibold">Bugungi kurs</h2>

          {/*
            §18.4 — CBU har kuni 09:00 da avtomatik olinadi, lekin kun
            davomida ham yangilash mumkin: CBU kun ichida kursni
            o'zgartirsa, ertagacha kutish shart emas.
          */}
          <Button
            type="button"
            onClick={() => {
              syncNow.mutate();
            }}
            disabled={syncNow.isPending}
          >
            <RefreshCw
              size={16}
              aria-hidden="true"
              className={syncNow.isPending ? 'animate-spin' : undefined}
            />
            <span className="ml-2">{syncNow.isPending ? 'Olinmoqda…' : 'CBU’dan yangilash'}</span>
          </Button>
        </div>

        <FormError error={syncNow.error} />

        {syncNow.isSuccess && (
          <p
            role="status"
            className={`m-0 rounded-md px-3 py-2 text-sm font-medium ${
              syncNow.data.outcome === ExchangeRateSyncOutcome.WRITTEN
                ? 'bg-success-bg text-success'
                : 'bg-warning-bg text-warning'
            }`}
          >
            {syncNow.data.outcome === ExchangeRateSyncOutcome.WRITTEN
              ? `CBU kursi olindi (${formatRate(syncNow.data.rate.cbuRate ?? '0')}).`
              : 'CBU kursi yangilandi.'}
          </p>
        )}

        {today.isPending ? (
          <TableSkeleton rows={2} />
        ) : today.isError ? (
          <ErrorState
            error={today.error}
            onRetry={() => {
              void today.refetch();
            }}
          />
        ) : rate ? (
          <>
            <div className="flex flex-wrap gap-x-10 gap-y-4">
              <div>
                <p className="m-0 text-sm text-text-secondary">Sotish</p>
                <p className="tabular m-0 text-2xl font-semibold">
                  {formatRate(rate.storeRate)} so‘m
                </p>
              </div>
              <div>
                <p className="m-0 text-sm text-text-secondary">Olish (CBU)</p>
                <p className="tabular m-0 text-2xl font-semibold text-text-secondary">
                  {rate.cbuRate ? `${formatRate(rate.cbuRate)} so‘m` : '—'}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="m-0 text-sm text-text-secondary">Manba</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={rate.source === ExchangeRateSource.MANUAL ? 'warning' : 'info'}>
                    {SOURCE_LABEL[rate.source]}
                  </Badge>
                  {today.data.staleness === RateStaleness.FRESH ? (
                    <Badge tone="success">Bugungi</Badge>
                  ) : (
                    <Badge
                      tone={today.data.staleness === RateStaleness.WARN ? 'warning' : 'danger'}
                    >
                      {today.data.staleDays} kun eskirgan
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <p className="m-0 text-sm text-text-tertiary">
              Amaldagi qator sanasi: <span className="tabular">{rate.date}</span>
            </p>
          </>
        ) : (
          /*
            §1.5 — kurs yo'qligi savdoni to'xtatmaydi, lekin USD narxlarni
            aylantirib bo'lmaydi. Shuning uchun bu bo'sh holat emas, amal
            talab qiladigan ogohlantirish.
          */
          <p className="m-0 rounded-md bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
            Valyuta kursi hali kiritilmagan. Yuqoridagi tugma orqali CBU’dan yangilang.
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="m-0 text-lg font-semibold">Kurs tarixi</h2>

        {history.isPending ? (
          <TableSkeleton rows={5} />
        ) : history.isError ? (
          <ErrorState
            error={history.error}
            onRetry={() => {
              void history.refetch();
            }}
          />
        ) : history.data.length === 0 ? (
          <p className="m-0 text-text-secondary">Hali kurs yozuvi yo‘q.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Oxirgi 30 kunlik kurs tarixi</caption>
              <thead>
                <tr className="border-b border-border-default text-left text-text-secondary">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Sana
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    Olish (CBU)
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    Sotish
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Manba
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.data.map((row) => (
                  <tr key={row.id} className="border-b border-border-soft">
                    <td className="py-2 pr-4 whitespace-nowrap">{row.date}</td>
                    <td className="py-2 pr-4 text-right">
                      {row.cbuRate ? formatRate(row.cbuRate) : '—'}
                    </td>
                    <td className="py-2 pr-4 text-right font-medium">
                      {formatRate(row.storeRate)}
                    </td>
                    <td className="py-2">
                      <Badge tone={row.source === ExchangeRateSource.MANUAL ? 'warning' : 'muted'}>
                        {SOURCE_LABEL[row.source]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
