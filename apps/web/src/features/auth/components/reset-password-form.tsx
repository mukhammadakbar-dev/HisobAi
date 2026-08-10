'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PASSWORD_MIN_LENGTH, resetPasswordSchema } from '@hisobai/contracts';
import type { ResetPasswordInput } from '@hisobai/contracts';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button, Field, Input } from '../../../components/ui';
import { useResetPassword } from '../queries';
import { FormError } from './form-error';

/**
 * Xatdagi havola bo'yicha yangi parol o'rnatish (§2.5).
 *
 * Muvaffaqiyatdan keyin **barcha** sessiyalar bekor qilinadi
 * (`auth.service.ts`) — shuning uchun bu yerda avtomatik kirish yo'q,
 * foydalanuvchi yangi parol bilan qaytadan kiradi.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const reset = useResetPassword();
  /**
   * Tasdiq maydoni **formadan tashqarida**: `resetPasswordSchema`
   * `.strict()` va notanish maydonni rad etadi. Uni sxemaga qo'shish
   * server kontraktini UI ehtiyoji uchun o'zgartirish bo'lardi.
   */
  const [confirm, setConfirm] = useState('');
  const [confirmError, setConfirmError] = useState<string | undefined>();

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, newPassword: '' },
  });

  const onSubmit = handleSubmit((values) => {
    if (values.newPassword !== confirm) {
      setConfirmError('Parollar bir xil emas');
      return;
    }
    setConfirmError(undefined);
    reset.mutate(values);
  });

  if (reset.isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <p className="m-0 rounded-md bg-success-bg px-3 py-2 text-sm font-medium text-success">
          Parol o‘zgartirildi. Barcha qurilmalardagi sessiyalar yopildi.
        </p>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-action px-4 text-sm font-semibold text-action-text"
        >
          Kirish
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError error={reset.error} />

      <input type="hidden" {...register('token')} />

      <Field label="Yangi parol" htmlFor="new-password" error={errors.newPassword?.message}>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          autoFocus
          {...register('newPassword')}
        />
      </Field>

      <Field label="Yangi parolni takrorlang" htmlFor="confirm-password" error={confirmError}>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => {
            setConfirm(event.target.value);
            // Foydalanuvchi tuzatishni boshlagach xato darhol yo'qolsin
            if (confirmError && event.target.value === getValues('newPassword')) {
              setConfirmError(undefined);
            }
          }}
        />
      </Field>

      <p className="m-0 text-sm text-text-tertiary">
        Parol kamida {PASSWORD_MIN_LENGTH} belgidan iborat bo‘lsin.
      </p>

      <Button type="submit" variant="primary" disabled={reset.isPending}>
        {reset.isPending ? 'Saqlanmoqda…' : 'Parolni o‘rnatish'}
      </Button>
    </form>
  );
}
