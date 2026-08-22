'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { FileKind, updateShopSchema } from '@hisobai/contracts';
import type { ShopDto, UpdateShopInput } from '@hisobai/contracts';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { FileUpload } from '../../../components/files';
import { ErrorState, TableSkeleton } from '../../../components/states';
import { Button, Card, Field, Input } from '../../../components/ui';
import { applyApiFieldErrors, isFieldOwnedError } from '../../../lib/form-errors';
import { FormError } from '../../auth/components/form-error';
import { useShop, useUpdateShop } from '../queries';

/**
 * Do'kon sozlamalari (§3.6–§3.9).
 *
 * Forma qiymatlari — sxemaning **kirish** tipi: `<input>` doim satr
 * beradi, `decimalString` esa satrni ham, sonni ham qabul qiladi va
 * ichkarida satrga aylantiradi. Chiqish tipi (`UpdateShopInput`)
 * `handleSubmit` dan keladi, ya'ni mutatsiyaga allaqachon tekshirilgan
 * qiymat tushadi (`FRONTEND.md` §6.1).
 */
interface ShopFormValues {
  name?: string;
  logoFileId?: string | null;
  address?: string | null;
  phone?: string | null;
  workStart?: string;
  workEnd?: string;
  weekendDays?: number[];
  lowStockThreshold?: number;
  defaultInstallmentMonths?: number;
  defaultDownPaymentPercent?: string | number;
  reminderHour?: number;
  expectedUpdatedAt?: string;
}

/**
 * Serverdan maydon nomi kelganda tan olinadiganlar.
 *
 * `expectedUpdatedAt` ataylab yo'q: u ko'rinadigan input emas, unga
 * bog'langan xato ekranda hech qachon chiqmasdi. Qulf konflikti
 * (`STALE_RESOURCE`) baribir banner sifatida ko'rsatiladi.
 */
const FIELDS = [
  'name',
  'logoFileId',
  'address',
  'phone',
  'workStart',
  'workEnd',
  'weekendDays',
  'lowStockThreshold',
  'defaultInstallmentMonths',
  'defaultDownPaymentPercent',
  'reminderHour',
] as const;

/** 0 = yakshanba — `settings.weekend_days` bilan bir xil raqamlash. */
const WEEKDAYS = [
  { value: 0, label: 'Yak' },
  { value: 1, label: 'Du' },
  { value: 2, label: 'Se' },
  { value: 3, label: 'Chor' },
  { value: 4, label: 'Pay' },
  { value: 5, label: 'Ju' },
  { value: 6, label: 'Sha' },
];

/** Bo'sh maydon — "o'zgartirma", nol emas. Sxema `.partial()` bo'lgani uchun tushib qoladi. */
const optionalNumber = (value: string): number | undefined =>
  value === '' ? undefined : Number(value);
const optionalText = (value: string): string | null => (value === '' ? null : value);
const optionalDecimal = (value: string): string | undefined => (value === '' ? undefined : value);

function toFormValues(settings: ShopDto): ShopFormValues {
  return {
    /**
     * Qulf tokeni forma qiymatlari ichida yuriydi (`API.md` §8) — keshdan
     * emas. Farqi muhim: boshqa qurilma sozlamani o'zgartirsa, fon
     * yangilanishi keshga **yangi** `updatedAt` ni qo'yadi. Token o'shandan
     * olinsa, ega o'z tahririni yuborganda konflikt aniqlanmay o'tib
     * ketardi — ya'ni qulf aynan o'zi uchun yaratilgan holatda ishlamasdi.
     * Bu yerda token forma **yuklangan** versiyaga bog'lanadi.
     */
    expectedUpdatedAt: settings.updatedAt,
    name: settings.name,
    logoFileId: settings.logoFileId,
    address: settings.address,
    phone: settings.phone?.replace(/^\+998/, '') ?? null,
    workStart: settings.workStart,
    workEnd: settings.workEnd,
    weekendDays: settings.weekendDays,
    lowStockThreshold: settings.lowStockThreshold,
    defaultInstallmentMonths: settings.defaultInstallmentMonths,
    defaultDownPaymentPercent: settings.defaultDownPaymentPercent,
    reminderHour: settings.reminderHour,
  };
}

export function ShopForm() {
  const settings = useShop();
  const update = useUpdateShop();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors, isDirty },
  } = useForm<ShopFormValues, unknown, UpdateShopInput>({
    resolver: zodResolver(updateShopSchema),
    defaultValues: {},
  });

  /**
   * Server ma'lumoti kelganda forma to'ldiriladi — lekin **tahrir
   * boshlangan bo'lsa tegilmaydi**.
   *
   * `refetchOnReconnect: true` (`query-client.ts`): do'konda internet
   * uzilib-ulanib turadi, ya'ni ega forma to'ldirayotganda fon so'rovi
   * kelishi oddiy hol. Shartsiz `reset` o'shanda kiritilgan hamma
   * narsani jimgina o'chirib tashlardi.
   */
  useEffect(() => {
    if (settings.data && !isDirty) reset(toFormValues(settings.data));
  }, [settings.data, isDirty, reset]);

  const weekendDays = watch('weekendDays') ?? [];

  const toggleWeekend = (day: number): void => {
    const next = weekendDays.includes(day)
      ? weekendDays.filter((value) => value !== day)
      : [...weekendDays, day].sort((a, b) => a - b);
    setValue('weekendDays', next, { shouldDirty: true });
  };

  const onSubmit = handleSubmit((values) => {
    update.mutate(values, {
      // Javobdagi yangi `updatedAt` keyingi saqlash uchun token bo'ladi;
      // shu bilan birga forma "toza" holatga qaytadi
      onSuccess: (saved) => {
        reset(toFormValues(saved));
      },
      onError: (error) => {
        applyApiFieldErrors(error, setError, FIELDS);
      },
    });
  });

  if (settings.isPending) {
    return (
      <Card>
        <TableSkeleton rows={6} />
      </Card>
    );
  }

  if (settings.isError) {
    return (
      <ErrorState
        error={settings.error}
        onRetry={() => {
          void settings.refetch();
        }}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {/* Yangi tahrir boshlangach "saqlandi" yozuvi yolg'on bo'lib qoladi */}
      {update.isSuccess && !isDirty && (
        <p
          role="status"
          className="m-0 rounded-md bg-success-bg px-3 py-2 text-sm font-medium text-success"
        >
          Sozlamalar saqlandi.
        </p>
      )}

      {!isFieldOwnedError(update.error, FIELDS) && <FormError error={update.error} />}

      <Card className="flex flex-col gap-4">
        <h2 className="m-0 text-lg font-semibold">Do‘kon</h2>
        <p className="m-0 text-sm text-text-tertiary">
          Bu ma’lumotlar shartnoma PDF’ida va eksportlarda chiqadi (§3.6).
        </p>

        <Field label="Do‘kon nomi" htmlFor="name" error={errors.name?.message}>
          <Input id="name" {...register('name')} />
        </Field>

        {/* §19.7 — do'kon logosi */}
        <FileUpload
          kind={FileKind.SHOP_LOGO}
          accept="image/jpeg,image/png,image/webp"
          label="Do‘kon logosi"
          existingFileId={settings.data?.logoFileId ?? null}
          onUploaded={(fileId) => {
            setValue('logoFileId', fileId, { shouldDirty: true });
          }}
        />

        <Field label="Manzil" htmlFor="address" error={errors.address?.message}>
          <Input id="address" {...register('address', { setValueAs: optionalText })} />
        </Field>

        <Field label="Telefon" htmlFor="phone" error={errors.phone?.message}>
        <div className="flex min-h-11 w-full rounded-md border border-border-default bg-surface-card">
          <span className="flex select-none items-center border-r border-border-default px-3 text-text-secondary">
            +998
          </span>
          <input
            id="phone"
            inputMode="numeric"
            maxLength={9}
            placeholder="90 123 45 67"
            autoComplete="tel"
            className="flex-1 bg-transparent px-3 text-base text-text-primary outline-none placeholder:text-text-tertiary"
            {...register('phone', {
              setValueAs: (v: string) => {
                const digits = v.replace(/\D/g, '');
                return digits === '' ? null : `+998${digits}`;
              },
            })}
            onInput={(e) => {
              e.currentTarget.value = e.currentTarget.value.replace(/\D/g, '');
            }}
          />
        </div>
      </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="m-0 text-lg font-semibold">Ish vaqti</h2>
        <p className="m-0 text-sm text-text-tertiary">
          Hisobot o‘rtachalari uchun va dam olish kunida eslatma yubormaslik uchun (§3.7).
        </p>

        <div className="flex flex-wrap gap-4">
          <div className="flex-1 basis-40">
            <Field label="Ochilish" htmlFor="workStart" error={errors.workStart?.message}>
              <Input id="workStart" type="time" {...register('workStart')} />
            </Field>
          </div>
          <div className="flex-1 basis-40">
            <Field label="Yopilish" htmlFor="workEnd" error={errors.workEnd?.message}>
              <Input id="workEnd" type="time" {...register('workEnd')} />
            </Field>
          </div>
        </div>

        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1.5 p-0 text-sm font-medium text-text-secondary">
            Dam olish kunlari
          </legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const active = weekendDays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    toggleWeekend(day.value);
                  }}
                  className={`min-h-11 min-w-11 rounded-md border px-3 text-sm font-medium transition-colors ${
                    active
                      ? 'border-action bg-action text-action-text'
                      : 'border-border-default text-text-secondary hover:bg-surface-raised'
                  }`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          {errors.weekendDays && (
            <p className="m-0 mt-1.5 text-sm text-danger" role="alert">
              {errors.weekendDays.message}
            </p>
          )}
        </fieldset>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="m-0 text-lg font-semibold">Savdo va nasiya</h2>

        <Field
          label="Kam qoldiq chegarasi"
          htmlFor="lowStockThreshold"
          error={errors.lowStockThreshold?.message}
        >
          <Input
            id="lowStockThreshold"
            type="number"
            min={0}
            inputMode="numeric"
            {...register('lowStockThreshold', { setValueAs: optionalNumber })}
          />
        </Field>

        <div className="flex flex-wrap gap-4">
          <div className="flex-1 basis-48">
            <Field
              label="Standart nasiya muddati (oy)"
              htmlFor="defaultInstallmentMonths"
              error={errors.defaultInstallmentMonths?.message}
            >
              <Input
                id="defaultInstallmentMonths"
                type="number"
                min={1}
                inputMode="numeric"
                {...register('defaultInstallmentMonths', { setValueAs: optionalNumber })}
              />
            </Field>
          </div>
          <div className="flex-1 basis-48">
            <Field
              label="Boshlang‘ich to‘lov (%)"
              htmlFor="defaultDownPaymentPercent"
              error={errors.defaultDownPaymentPercent?.message}
            >
              <Input
                id="defaultDownPaymentPercent"
                inputMode="decimal"
                {...register('defaultDownPaymentPercent', { setValueAs: optionalDecimal })}
              />
            </Field>
          </div>
        </div>

        <p className="m-0 text-sm text-text-tertiary">
          Bu qiymatlar nasiya formasida oldindan to‘ldiriladi, har savdoda o‘zgartirsa bo‘ladi
          (§3.9). 0% ham ruxsat etiladi — tizim faqat ogohlantiradi (§16.3).
        </p>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="m-0 text-lg font-semibold">Eslatma</h2>

        <Field label="Eslatma soati" htmlFor="reminderHour" error={errors.reminderHour?.message}>
          <Input
            id="reminderHour"
            type="number"
            min={0}
            max={23}
            inputMode="numeric"
            {...register('reminderHour', { setValueAs: optionalNumber })}
          />
        </Field>
      </Card>

      <div>
        <Button type="submit" variant="primary" disabled={update.isPending}>
          {update.isPending ? 'Saqlanmoqda…' : 'Saqlash'}
        </Button>
      </div>
    </form>
  );
}
