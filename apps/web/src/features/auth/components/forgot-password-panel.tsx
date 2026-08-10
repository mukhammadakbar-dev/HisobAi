'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema } from '@hisobai/contracts';
import type { ForgotPasswordInput } from '@hisobai/contracts';
import { useForm } from 'react-hook-form';

import { Button, Field, Input } from '../../../components/ui';
import { useForgotPassword } from '../queries';
import { FormError } from './form-error';

/**
 * Parol tiklash havolasini so'rash (§2.5).
 *
 * Alohida marshrut emas, `/login` ichidagi panel: `DECISIONS.md` §2
 * "`/login` — yagona ochiq sahifa" deydi. Tiklash havolasi bosilganda
 * ochiladigan `/reset-password` esa muqarrar ikkinchi ochiq sahifa —
 * xatdagi havola qayerdadir tushishi kerak.
 */
export function ForgotPasswordPanel({ onBack }: { onBack: () => void }) {
  const forgot = useForgotPassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit((values) => {
    forgot.mutate(values);
  });

  /**
   * Muvaffaqiyat matni email mavjudligini **oshkor qilmaydi** — server ham
   * xuddi shunday ishlaydi (har doim `204`). Aks holda bu forma
   * ro'yxatdan o'tgan emaillarni tekshirish vositasiga aylanardi.
   */
  if (forgot.isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <p className="m-0 rounded-md bg-success-bg px-3 py-2 text-sm font-medium text-success">
          Agar bu email tizimda ro‘yxatdan o‘tgan bo‘lsa, tiklash havolasi yuborildi. Havola 30
          daqiqa amal qiladi.
        </p>
        <Button type="button" onClick={onBack}>
          Kirishga qaytish
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="m-0 text-sm text-text-secondary">
        Hisobingiz emailini kiriting — parolni tiklash havolasini yuboramiz.
      </p>

      <FormError error={forgot.error} />

      <Field label="Email" htmlFor="forgot-email" error={errors.email?.message}>
        <Input
          id="forgot-email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoFocus
          {...register('email')}
        />
      </Field>

      <Button type="submit" variant="primary" disabled={forgot.isPending}>
        {forgot.isPending ? 'Yuborilmoqda…' : 'Havola yuborish'}
      </Button>

      <button
        type="button"
        onClick={onBack}
        className="min-h-11 self-center text-sm font-medium text-link underline-offset-2 hover:underline"
      >
        Kirishga qaytish
      </button>
    </form>
  );
}
