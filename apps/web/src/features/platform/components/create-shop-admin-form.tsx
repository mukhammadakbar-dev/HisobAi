'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createShopAdminSchema } from '@hisobai/contracts';
import type { CreateShopAdminInput } from '@hisobai/contracts';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { Button, Field, Input } from '../../../components/ui';
import { applyApiFieldErrors, isFieldOwnedError } from '../../../lib/form-errors';
import { FormError } from '../../auth/components/form-error';
import { useCreateShopAdmin } from '../queries';

/**
 * Yangi SHOP_ADMIN hisobi (§25.5).
 *
 * Formada **do'kon maydonlari yo'q** va bu asosiy qoida: SUPERADMIN
 * hisob yaratadi, Shop'ni esa egasi o'zi tuzadi. `createShopAdminSchema`
 * `.strict()` bo'lgani uchun `shopId` yoki `status` yuborilsa server
 * uni jimgina e'tiborsiz qoldirmaydi, rad etadi.
 *
 * Boshlang'ich parol shu yerda qo'yiladi va egasiga alohida kanal
 * orqali beriladi. Parol tiklash havolasi bilan yuborish yaxshiroq
 * bo'lardi, lekin SMTP provideri hali tanlanmagan (§2.5, `TZ.md` §24).
 */
const FIELD_NAMES = ['email', 'password', 'displayName'] as const;

export function CreateShopAdminForm() {
  const router = useRouter();
  const create = useCreateShopAdmin();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CreateShopAdminInput>({
    resolver: zodResolver(createShopAdminSchema),
    defaultValues: { email: '', password: '', displayName: '' },
  });

  const onSubmit = handleSubmit((values) => {
    create.mutate(values, {
      onSuccess: (admin) => {
        router.replace(`/superadmin/accounts/${admin.id}`);
      },
      onError: (error) => {
        applyApiFieldErrors(error, setError, FIELD_NAMES);
      },
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {!isFieldOwnedError(create.error, FIELD_NAMES) && <FormError error={create.error} />}

      <Field label="Do‘kon egasining ismi" htmlFor="displayName" error={errors.displayName?.message}>
        <Input id="displayName" autoFocus autoComplete="name" {...register('displayName')} />
      </Field>

      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          {...register('email')}
        />
      </Field>

      <Field
        label="Boshlang‘ich parol"
        htmlFor="password"
        error={errors.password?.message}
        hint="Egasiga alohida yetkazing — u kirgandan keyin o‘zgartira oladi."
      >
        <Input id="password" type="text" autoComplete="off" {...register('password')} />
      </Field>

      <Button type="submit" variant="primary" disabled={create.isPending}>
        {create.isPending ? 'Yaratilmoqda…' : 'Hisob yaratish'}
      </Button>
    </form>
  );
}
