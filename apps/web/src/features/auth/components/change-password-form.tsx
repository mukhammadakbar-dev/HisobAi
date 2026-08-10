'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PASSWORD_MIN_LENGTH, changePasswordSchema } from '@hisobai/contracts';
import type { ChangePasswordInput } from '@hisobai/contracts';
import { useForm } from 'react-hook-form';

import { Button, Card, Field, Input } from '../../../components/ui';
import { applyApiFieldErrors, isFieldOwnedError } from '../../../lib/form-errors';
import { useChangePassword } from '../queries';
import { FormError } from './form-error';

/** Serverdan maydon nomi kelganda faqat shular tan olinadi. */
const FIELDS = ['currentPassword', 'newPassword'] as const;

/**
 * Parolni o'zgartirish (§17.16 — `POST /auth/change-password`).
 *
 * Server bu amalda **boshqa barcha sessiyalarni bekor qiladi**, joriy
 * qurilma qoladi. Buni foydalanuvchiga aytish shart: aks holda u boshqa
 * telefonidan chiqib qolganini tushunmaydi.
 */
export function ChangePasswordForm() {
  const changePassword = useChangePassword();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const onSubmit = handleSubmit((values) => {
    changePassword.mutate(values, {
      onSuccess: () => {
        // Parollar formada qolib ketmasin
        reset({ currentPassword: '', newPassword: '' });
      },
      // "Joriy parol noto'g'ri" aynan o'sha input yonida chiqsin
      onError: (error) => {
        applyApiFieldErrors(error, setError, FIELDS);
      },
    });
  });

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="m-0 text-lg font-semibold">Parolni o‘zgartirish</h2>

      <form onSubmit={onSubmit} noValidate className="flex max-w-md flex-col gap-4">
        {changePassword.isSuccess && (
          <p
            role="status"
            className="m-0 rounded-md bg-success-bg px-3 py-2 text-sm font-medium text-success"
          >
            Parol o‘zgartirildi. Boshqa qurilmalardagi sessiyalar yopildi.
          </p>
        )}

        {/* Maydonga bog'langan xato input yonida — bannerda takrorlanmaydi */}
        {!isFieldOwnedError(changePassword.error, FIELDS) && (
          <FormError error={changePassword.error} />
        )}

        <Field
          label="Joriy parol"
          htmlFor="current-password"
          error={errors.currentPassword?.message}
        >
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            {...register('currentPassword')}
          />
        </Field>

        <Field label="Yangi parol" htmlFor="next-password" error={errors.newPassword?.message}>
          <Input
            id="next-password"
            type="password"
            autoComplete="new-password"
            {...register('newPassword')}
          />
        </Field>

        <p className="m-0 text-sm text-text-tertiary">Kamida {PASSWORD_MIN_LENGTH} belgi.</p>

        <Button type="submit" variant="primary" disabled={changePassword.isPending}>
          {changePassword.isPending ? 'Saqlanmoqda…' : 'Parolni o‘zgartirish'}
        </Button>
      </form>
    </Card>
  );
}
