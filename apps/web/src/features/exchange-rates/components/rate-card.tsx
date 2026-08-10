'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  ExchangeRateSource,
  RateStaleness,
  computeStoreRate,
  formatRate,
  upsertExchangeRateSchema,
} from '@hisobai/contracts';
import type { UpsertExchangeRateInput } from '@hisobai/contracts';
import { useForm } from 'react-hook-form';

import { ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Button, Card, Field, Input } from '../../../components/ui';
import { todayInShopZone } from '../../../lib/format';
import { applyApiFieldErrors, isFieldOwnedError } from '../../../lib/form-errors';
import { FormError } from '../../auth/components/form-error';
import { useSettings } from '../../settings/queries';
import { useRateHistory, useResetRateToCbu, useTodayRate, useUpsertRate } from '../queries';

/**
 * Valyuta kursi (§3.1–§3.5, §16.2, §16.6, §16.8).
 *
 * Ikkala kurs yonma-yon ko'rsatiladi (§3.2): CBU — ma'lumot uchun,
 * do'kon kursi — savdo va to'lovlarda **aynan shu** ishlatiladi.
 */
interface RateFormValues {
  /** Majburiy: kursni "qo'ymaslik" degan holat yo'q — forma shu maydon uchun. */
  storeRate: string | number;
  cbuRate?: string | number | null;
}

const FIELDS = ['storeRate', 'cbuRate'] as const;

const SOURCE_LABEL: Record<ExchangeRateSource, string> = {
  [ExchangeRateSource.CBU]: 'CBU',
  [ExchangeRateSource.MANUAL]: "Qo'lda",
};

export function RateCard() {
  const today = useTodayRate();
  const history = useRateHistory();
  const settings = useSettings();
  const upsert = useUpsertRate();
  const resetToCbu = useResetRateToCbu();

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<RateFormValues, unknown, UpsertExchangeRateInput>({
    resolver: zodResolver(upsertExchangeRateSchema),
    defaultValues: { storeRate: '' },
  });

  const rate = today.data?.rate ?? null;
  const markup = settings.data?.storeRateMarkupPercent;

  /**
   * §16.2 — taklif qilinadigan kurs. Hisob `contracts` dagi
   * `computeStoreRate` bilan: server ham aynan shu funksiyani ishlatadi,
   * shuning uchun UI'dagi son va bazadagi son bir xil bo'ladi.
   *
   * CBU kursi bilan birga saqlanadi — ko'rsatishda `rate` ni qayta
   * tekshirish kerak bo'lmasin.
   */
  const suggestion =
    rate?.cbuRate != null && markup !== undefined
      ? { storeRate: computeStoreRate(rate.cbuRate, markup), cbuRate: rate.cbuRate, markup }
      : null;

  const onSubmit = handleSubmit((values) => {
    upsert.mutate(
      { date: todayInShopZone(), input: values },
      {
        // Maydonlar bo'shatiladi: yangi kurs yuqoridagi blokda ko'rinadi,
        // formada esa "keyingi o'zgartirish" uchun toza holat qoladi
        onSuccess: () => {
          reset({ storeRate: '' });
        },
        onError: (error) => {
          applyApiFieldErrors(error, setError, FIELDS);
        },
      },
    );
  });

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <h2 className="m-0 text-lg font-semibold">Bugungi kurs</h2>

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
                <p className="m-0 text-sm text-text-secondary">Do‘kon kursi</p>
                <p className="tabular m-0 text-2xl font-semibold">
                  {formatRate(rate.storeRate)} so‘m
                </p>
              </div>
              <div>
                <p className="m-0 text-sm text-text-secondary">CBU kursi</p>
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

            {/*
              §16.8 — qo'lda qo'yilgan kursni avtomatik jarayon ustidan
              yozmaydi. Buni aytish shart: aks holda ega ertasi kuni kurs
              nega yangilanmaganini tushunmaydi.
            */}
            {rate.source === ExchangeRateSource.MANUAL && (
              <div className="flex flex-col gap-3 rounded-md bg-warning-bg px-3 py-2">
                <p className="m-0 text-sm text-warning">
                  Do‘kon kursi qo‘lda qo‘yilgan — avtomatik CBU yangilanishi uni ustidan yozmaydi.
                  CBU kursi esa ma’lumot uchun yangilanib turadi.
                </p>

                <FormError error={resetToCbu.error} />

                {/*
                  §16.8 — `MANUAL` dan chiqishning yagona yo'li. Usiz bu
                  holat o'lik tugun bo'lib qolardi: bir marta qo'lda kurs
                  qo'yilsa, o'sha kun uchun avtomatik yangilanish
                  butunlay to'xtardi.
                */}
                <div>
                  <Button
                    type="button"
                    onClick={() => {
                      resetToCbu.mutate(rate.date);
                    }}
                    disabled={resetToCbu.isPending || rate.cbuRate === null}
                  >
                    {resetToCbu.isPending ? 'Qaytarilmoqda…' : 'CBU kursiga qaytarish'}
                  </Button>
                </div>

                {rate.cbuRate === null && (
                  <p className="m-0 text-sm text-text-tertiary">
                    Bu sana uchun CBU kursi olinmagan — qaytarish uchun asos yo‘q.
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          /*
            §1.5 — kurs yo'qligi savdoni to'xtatmaydi, lekin USD narxlarni
            aylantirib bo'lmaydi. Shuning uchun bu bo'sh holat emas, amal
            talab qiladigan ogohlantirish.
          */
          <p className="m-0 rounded-md bg-danger-bg px-3 py-2 text-sm font-medium text-danger">
            Valyuta kursi hali kiritilmagan. Quyida bugungi kursni qo‘lda qo‘ying.
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="m-0 text-lg font-semibold">Kursni qo‘lda qo‘yish</h2>
        <p className="m-0 text-sm text-text-tertiary">
          Bugungi sana uchun yoziladi (<span className="tabular">{todayInShopZone()}</span>) va
          manba <strong>Qo‘lda</strong> bo‘lib qoladi (§16.8).
        </p>

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {/* Yangi qiymat kiritila boshlangach "saqlandi" yozuvi yolg'on bo'lib qoladi */}
          {upsert.isSuccess && !isDirty && (
            <p
              role="status"
              className="m-0 rounded-md bg-success-bg px-3 py-2 text-sm font-medium text-success"
            >
              Kurs saqlandi.
            </p>
          )}

          {!isFieldOwnedError(upsert.error, FIELDS) && <FormError error={upsert.error} />}

          <div className="flex flex-wrap gap-4">
            <div className="flex-1 basis-48">
              <Field
                label="Do‘kon kursi (so‘m)"
                htmlFor="storeRate"
                error={errors.storeRate?.message}
              >
                <Input
                  id="storeRate"
                  inputMode="decimal"
                  placeholder={rate?.storeRate ?? '12500'}
                  {...register('storeRate')}
                />
              </Field>
            </div>
            <div className="flex-1 basis-48">
              <Field
                label="CBU kursi (ixtiyoriy)"
                htmlFor="cbuRate"
                error={errors.cbuRate?.message}
              >
                <Input
                  id="cbuRate"
                  inputMode="decimal"
                  placeholder={rate?.cbuRate ?? '—'}
                  {...register('cbuRate', {
                    // Bo'sh maydon — "tegma", nol emas
                    setValueAs: (value: string) => (value === '' ? undefined : value),
                  })}
                />
              </Field>
            </div>
          </div>

          {suggestion && (
            <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface-raised px-3 py-2 text-sm">
              <span>
                Ustama bo‘yicha taklif:{' '}
                <strong className="tabular">{formatRate(suggestion.storeRate)}</strong> so‘m
                <span className="text-text-tertiary">
                  {' '}
                  (CBU {formatRate(suggestion.cbuRate)} × {suggestion.markup}%)
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setValue('storeRate', suggestion.storeRate, { shouldDirty: true });
                }}
                className="min-h-9 rounded-md border border-border-default bg-surface-card px-3 text-sm font-semibold"
              >
                Qo‘yish
              </button>
            </div>
          )}

          <div>
            <Button type="submit" variant="primary" disabled={upsert.isPending}>
              {upsert.isPending ? 'Saqlanmoqda…' : 'Kursni saqlash'}
            </Button>
          </div>
        </form>
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
                    CBU
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">
                    Do‘kon
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
