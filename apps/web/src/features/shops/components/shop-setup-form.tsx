'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createShopSchema } from '@hisobai/contracts';
import type { CreateShopInput } from '@hisobai/contracts';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { Button, Field, Input } from '../../../components/ui';
import { applyApiFieldErrors, isFieldOwnedError } from '../../../lib/form-errors';
import { FormError } from '../../auth/components/form-error';
import { useCreateShop } from '../queries';

/**
 * Shop setup formasi (§25.6) — SHOP_ADMIN o'ziga do'kon yaratadi.
 *
 * **Faqat nom majburiy** (`createShopSchema` — `shopFields` dan
 * `.required({ name: true })`). Qolgan hamma narsa — manzil, telefon,
 * ish vaqti, kam qoldiq chegarasi, nasiya standartlari — keyin
 * `/settings` da to'ldiriladi va bazada oqilona default'lari bor
 * (§21.4). Sabab: bu ekran foydalanuvchi va ishlaydigan tizim
 * o'rtasidagi **yagona to'siq**, va uni uzun forma qilish ishni
 * boshlashni kechiktirardi. §3.6 dagi to'liq ma'lumot PDF va
 * eksportlar uchun kerak — ular MVP-2 da.
 */
const FIELD_NAMES = ['name', 'address', 'phone'] as const;

/**
 * Forma qiymatlari — sxemaning **kirish** tipi (`shop-form.tsx` dagi bilan
 * bir xil mulohaza): `<input>` doim satr beradi, sxema esa uni tozalab
 * chiqish tipiga aylantiradi. `handleSubmit` mutatsiyaga allaqachon
 * tekshirilgan `CreateShopInput` ni beradi (`FRONTEND.md` §6.1).
 */
interface SetupFormValues {
  /** Majburiy — `createShopSchema` uni `.required({ name: true })` qiladi. */
  name: string;
  address?: string | null;
  phone?: string | null;
}

export function ShopSetupForm() {
  const router = useRouter();
  const createShop = useCreateShop();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SetupFormValues, unknown, CreateShopInput>({
    resolver: zodResolver(createShopSchema),
    defaultValues: { name: '', address: '', phone: '' },
  });

  const onSubmit = handleSubmit((values) => {
    createShop.mutate(values, {
      onSuccess: () => {
        // `replace` — "orqaga" tugmasi allaqachon Shop'i bor
        // foydalanuvchini setup ekraniga qaytarmasin
        router.replace('/dashboard');
      },
      onError: (error) => {
        applyApiFieldErrors(error, setError, FIELD_NAMES);
      },
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {/* Maydonga tegishli xato formada ko'rsatiladi, bu yerda takrorlanmaydi */}
      {!isFieldOwnedError(createShop.error, FIELD_NAMES) && <FormError error={createShop.error} />}

      <Field label="Do‘kon nomi" htmlFor="name" error={errors.name?.message}>
        <Input id="name" autoFocus autoComplete="organization" {...register('name')} />
      </Field>

      <Field label="Manzil" htmlFor="address" error={errors.address?.message}>
        <Input id="address" autoComplete="street-address" {...register('address')} />
      </Field>

      <Field label="Telefon" htmlFor="phone" error={errors.phone?.message}>
        <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" {...register('phone')} />
      </Field>

      <Button type="submit" variant="primary" disabled={createShop.isPending}>
        {createShop.isPending ? 'Yaratilmoqda…' : 'Do‘konni yaratish'}
      </Button>
    </form>
  );
}
