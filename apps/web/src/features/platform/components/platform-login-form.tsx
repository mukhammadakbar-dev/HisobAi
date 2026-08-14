'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { platformLoginSchema } from '@hisobai/contracts';
import type { PlatformLoginInput } from '@hisobai/contracts';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { Button, Field, Input } from '../../../components/ui';
import { FormError } from '../../auth/components/form-error';
import { usePlatformLogin } from '../queries';

/**
 * SUPERADMIN kirish formasi (§25.4).
 *
 * Business `LoginForm` dan **ataylab alohida komponent**, garchi shakli
 * deyarli bir xil bo'lsa ham: ikkalasi boshqa sxemani (`platformLoginSchema`),
 * boshqa mutatsiyani va boshqa cookie'ni ishlatadi (§14.3). Umumiy
 * komponent qilib "rejim" parametri bilan boshqarilsa, ikkita mustaqil
 * sessiya tizimi bitta kod yo'lida chalkashardi — bu §21.3 dagi
 * ajratishning maqsadiga zid.
 *
 * "Parolni unutdingizmi?" havolasi **yo'q**: parol tiklash oqimi
 * (`password_reset_tokens`, §2.5) business `users` uchun qurilgan.
 * SUPERADMIN paroli hozircha server komandasi orqali tiklanadi (§2.6).
 */
export function PlatformLoginForm() {
  const router = useRouter();
  const login = usePlatformLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PlatformLoginInput>({
    resolver: zodResolver(platformLoginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: () => {
        router.replace('/superadmin');
      },
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError error={login.error} />

      <Field label="Email" htmlFor="platform-email" error={errors.email?.message}>
        <Input
          id="platform-email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoFocus
          {...register('email')}
        />
      </Field>

      <Field label="Parol" htmlFor="platform-password" error={errors.password?.message}>
        <Input
          id="platform-password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
      </Field>

      <Button type="submit" variant="primary" disabled={login.isPending}>
        {login.isPending ? 'Kirilmoqda…' : 'Kirish'}
      </Button>
    </form>
  );
}
