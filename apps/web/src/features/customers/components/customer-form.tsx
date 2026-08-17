'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { FileKind, createCustomerSchema, formatPhone, normalizePhone } from '@hisobai/contracts';
import type { CreateCustomerInput, CustomerDto } from '@hisobai/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { FileUpload } from '../../../components/files';
import { Button, Card, Field, Input } from '../../../components/ui';
import { applyApiFieldErrors, isFieldOwnedError } from '../../../lib/form-errors';
import { can } from '../../../lib/permissions';
import { useCurrentUser } from '../../auth/queries';
import { FormError } from '../../auth/components/form-error';
import { useCreateCustomer, useDuplicateCustomer, useUpdateCustomer } from '../queries';

/**
 * Mijoz kartasi formasi (§6.4, §6.5).
 *
 * Ikkita narsa bu yerda ko'rinadi:
 *
 *  1. **Telefon saqlanishidan oldin ko'rsatiladi.** `normalizePhone`
 *     serverdagi bilan bitta funksiya, ya'ni ekrandagi qiymat bazaga
 *     tushadigan qiymat bilan bir xil (§6.2).
 *  2. **Dublikat yuborishdan OLDIN ogohlantiradi** (§6.3). Forma
 *     to'ldirilib bo'lgach `409` olish eng qimmat variant — ega ismni,
 *     manzilni va passportni allaqachon terib bo'lgan bo'ladi.
 */

const FIELDS = [
  'fullName',
  'phonePrimary',
  'phoneSecondary',
  'address',
  'note',
  'passportSeries',
  'passportNumber',
  'pinfl',
  'passportFileId',
] as const;

interface CustomerFormValues {
  fullName: string;
  phonePrimary: string;
  phoneSecondary: string | null;
  address: string | null;
  note: string | null;
  passportSeries: string | null;
  passportNumber: string | null;
  pinfl: string | null;
  passportFileId?: string | null;
}

function toFormValues(customer: CustomerDto | undefined): CustomerFormValues {
  return {
    fullName: customer?.fullName ?? '',
    // Tahrirda saqlangan E.164 ko'rsatiladi — u yaroqli kirish ham
    phonePrimary: customer?.phonePrimary ?? '',
    phoneSecondary: customer?.phoneSecondary ?? null,
    address: customer?.address ?? null,
    note: customer?.note ?? null,
    passportSeries: customer?.passportSeries ?? null,
    passportNumber: customer?.passportNumber ?? null,
    pinfl: customer?.pinfl ?? null,
    passportFileId: customer?.passportFileId ?? null,
  };
}

/** Bo'sh maydon — "yo'q", bo'sh satr emas. */
const optionalText = (value: string): string | null => (value.trim() === '' ? null : value);

export function CustomerForm({ customer }: { customer?: CustomerDto }) {
  const router = useRouter();
  const user = useCurrentUser();
  const create = useCreateCustomer();
  const update = useUpdateCustomer(customer?.id ?? '');
  const mutation = customer ? update : create;
  const canSeePassport = can(user.data, 'passport.view');

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<CustomerFormValues, unknown, CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: toFormValues(customer),
  });

  const phoneInput = watch('phonePrimary');
  const normalized = normalizePhone(phoneInput ?? '');
  const duplicate = useDuplicateCustomer(phoneInput ?? '');
  // Tahrirda mijozning o'z raqami dublikat emas
  const conflict = duplicate && duplicate.id !== customer?.id ? duplicate : null;

  const onSubmit = handleSubmit((input) => {
    const onError = (error: unknown): void => {
      applyApiFieldErrors(error, setError, FIELDS);
    };

    if (customer) {
      /**
       * Ko'rinmaydigan maydon **yuborilmaydi ham**.
       *
       * Forma tahrirda hamma maydonni yuboradi. Passport bloki
       * ko'rsatilmagan rolda esa `defaultValues` dagi qiymatlar `null`
       * bo'lardi (server ularni javobdan kesib tashlaydi) — ya'ni oddiy
       * "manzilni tuzatish" amali passport ma'lumotini jimgina o'chirib
       * yuborardi. Server ham buni to'sadi, bu esa birinchi qatlam.
       *
       * Yaratishda bunday xavf yo'q: u yerda o'chiriladigan qiymat
       * umuman yo'q va sxema maydonlarni majburiy qiladi.
       */
      const patch = canSeePassport
        ? input
        : {
            ...input,
            passportSeries: undefined,
            passportNumber: undefined,
            pinfl: undefined,
            passportFileId: undefined,
          };

      update.mutate(
        // Qulf tokeni forma yuklangan versiyaga bog'lanadi (`API.md` §8)
        { ...patch, expectedUpdatedAt: customer.updatedAt },
        {
          onSuccess: () => {
            router.push(`/customers/${customer.id}`);
          },
          onError,
        },
      );
      return;
    }

    create.mutate(input, {
      onSuccess: (created) => {
        router.push(`/customers/${created.id}`);
      },
      onError,
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {!isFieldOwnedError(mutation.error, FIELDS) && <FormError error={mutation.error} />}

      <Card className="flex flex-col gap-4">
        <Field label="Ism-familiya" htmlFor="fullName" error={errors.fullName?.message}>
          <Input id="fullName" placeholder="Alisher Karimov" {...register('fullName')} />
        </Field>

        <Field label="Asosiy telefon" htmlFor="phonePrimary" error={errors.phonePrimary?.message}>
          <Input
            id="phonePrimary"
            inputMode="tel"
            autoComplete="off"
            placeholder="90 123 45 67"
            aria-describedby="phone-hint"
            {...register('phonePrimary')}
          />
        </Field>
        <p id="phone-hint" className="m-0 text-sm text-text-tertiary">
          {normalized
            ? `Saqlanadi: ${formatPhone(normalized)} — SMS shu raqamga ketadi.`
            : 'SMS shu raqamga ketadi (§6.4).'}
        </p>

        {/* §6.3 — "Bu raqam Alisher Karimovda bor. O'shami?" */}
        {conflict && (
          <div
            role="status"
            className="flex flex-col gap-2 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning"
          >
            <span className="font-medium">
              Bu raqam {conflict.fullName}da bor{conflict.isActive ? '' : ' (arxivda)'}. O‘shami?
            </span>
            <Link
              href={`/customers/${conflict.id}`}
              className="w-fit font-semibold text-link hover:underline"
            >
              Kartasini ochish
            </Link>
          </div>
        )}

        <Field
          label="Qo‘shimcha telefon"
          htmlFor="phoneSecondary"
          error={errors.phoneSecondary?.message}
        >
          <Input
            id="phoneSecondary"
            inputMode="tel"
            autoComplete="off"
            {...register('phoneSecondary', { setValueAs: optionalText })}
          />
        </Field>

        <Field label="Manzil" htmlFor="address" error={errors.address?.message}>
          <Input id="address" {...register('address', { setValueAs: optionalText })} />
        </Field>

        <Field label="Izoh" htmlFor="note" error={errors.note?.message}>
          <Input id="note" {...register('note', { setValueAs: optionalText })} />
        </Field>
      </Card>

      {/* §6.5 — passport faqat nasiya shartnomasi uchun (§16.10) */}
      {canSeePassport && (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-lg font-semibold">Passport</h2>
            <p className="m-0 text-sm text-text-tertiary">
              Faqat nasiya shartnomasi uchun kerak — naqd savdoda to‘ldirilmasa ham bo‘ladi.
            </p>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="basis-32">
              <Field label="Seriya" htmlFor="passportSeries" error={errors.passportSeries?.message}>
                <Input
                  id="passportSeries"
                  placeholder="AA"
                  autoCapitalize="characters"
                  {...register('passportSeries', { setValueAs: optionalText })}
                />
              </Field>
            </div>
            <div className="flex-1 basis-40">
              <Field label="Raqam" htmlFor="passportNumber" error={errors.passportNumber?.message}>
                <Input
                  id="passportNumber"
                  inputMode="numeric"
                  placeholder="1234567"
                  {...register('passportNumber', { setValueAs: optionalText })}
                />
              </Field>
            </div>
          </div>

          <Field label="JSHSHIR" htmlFor="pinfl" error={errors.pinfl?.message}>
            <Input
              id="pinfl"
              inputMode="numeric"
              placeholder="14 ta raqam"
              {...register('pinfl', { setValueAs: optionalText })}
            />
          </Field>

          {/* §6.6, §6.7 — passport rasmi */}
          <FileUpload
            kind={FileKind.PASSPORT}
            accept="image/jpeg,image/png,image/webp"
            label="Passport rasmi"
            existingFileId={customer?.passportFileId ?? null}
            onUploaded={(fileId) => {
              setValue('passportFileId', fileId, { shouldDirty: true });
            }}
          />
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saqlanmoqda…' : customer ? 'Saqlash' : 'Qo‘shish'}
        </Button>
        <Button
          type="button"
          onClick={() => {
            router.back();
          }}
        >
          Bekor qilish
        </Button>
      </div>
    </form>
  );
}
