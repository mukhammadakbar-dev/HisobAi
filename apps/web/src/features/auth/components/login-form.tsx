'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@hisobai/contracts';
import type { LoginInput } from '@hisobai/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button, Field, Input } from '../../../components/ui';
import { useLogin } from '../queries';
import { ForgotPasswordPanel } from './forgot-password-panel';
import { FormError } from './form-error';

/**
 * Kirish formasi (§2, `DECISIONS.md` §2 — `/login` yagona ochiq sahifa).
 *
 * Validatsiya sxemasi `@hisobai/contracts` dan: server ham aynan shuni
 * qo'llaydi (`FRONTEND.md` §6.1), shuning uchun "forma to'g'ri edi, lekin
 * server rad etdi" holati bo'lmaydi.
 */
export function LoginForm() {
  const router = useRouter();
  const login = useLogin();
  const [showForgot, setShowForgot] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: () => {
        // `replace` — "orqaga" tugmasi kirgan foydalanuvchini login
        // sahifasiga qaytarmasin
        router.replace('/dashboard');
      },
    });
  });

  if (showForgot) {
    return (
      <ForgotPasswordPanel
        onBack={() => {
          setShowForgot(false);
        }}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError error={login.error} />

      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoFocus
          {...register('email')}
        />
      </Field>

      <Field label="Parol" htmlFor="password" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
      </Field>

      <Button type="submit" variant="primary" disabled={login.isPending}>
        {login.isPending ? 'Kirilmoqda…' : 'Kirish'}
      </Button>

      <button
        type="button"
        onClick={() => {
          setShowForgot(true);
        }}
        className="min-h-11 self-center text-sm font-medium text-link underline-offset-2 hover:underline"
      >
        Parolni unutdingizmi?
      </button>
    </form>
  );
}
