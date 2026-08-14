'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { Logo } from '../../components/layout/logo';
import { ThemeToggle } from '../../components/layout/theme-toggle';
import { ErrorState, TableSkeleton } from '../../components/states';
import { useCurrentUser } from '../../features/auth/queries';

/**
 * Shop setup qobig'i (§25.6) — `/setup-shop` uchun.
 *
 * **Nega `(app)` guruhida emas.** `(app)/layout.tsx` `AppShell` ni
 * chizadi, u esa `useShop()` orqali `GET /shops/me` so'raydi. Shop hali
 * yo'q ekan bu so'rov `SHOP_SETUP_REQUIRED` (409) qaytaradi — ya'ni
 * setup sahifasining o'zi xato banneri bilan ochilardi. Shuning uchun
 * qobiq `(auth)` kabi minimal: navigatsiya ham, kurs chizig'i ham,
 * do'kon nomi ham yo'q — ularning hammasi mavjud Shop'ni talab qiladi.
 *
 * Ikki tomonlama darvoza:
 *  - sessiya yo'q → `/login`;
 *  - Shop ALLAQACHON bor → `/dashboard`. Ikkinchisi shunchaki qulaylik
 *    emas: usiz foydalanuvchi bu sahifaga qaytib, `POST /shops` ni
 *    ikkinchi marta yuborardi va §25.7 bo'yicha `SHOP_ALREADY_EXISTS`
 *    xatosini ko'rardi — o'zi hech qanday xato qilmagan holda.
 */
export default function SetupLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const user = useCurrentUser();

  const isUnauthenticated = user.error?.status === 401;
  const hasShop = user.data?.shopId != null;

  useEffect(() => {
    if (isUnauthenticated) router.replace('/login');
    else if (hasShop) router.replace('/dashboard');
  }, [isUnauthenticated, hasShop, router]);

  if (user.isPending || isUnauthenticated || hasShop) {
    return (
      <div className="mx-auto max-w-sm px-4 py-10">
        <TableSkeleton rows={3} />
      </div>
    );
  }

  if (user.isError) {
    return (
      <div className="mx-auto max-w-sm px-4 py-10">
        <ErrorState
          error={user.error}
          onRetry={() => {
            void user.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-surface-page px-5 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <Logo className="h-8 w-auto" />
          <ThemeToggle />
        </div>

        <div className="rounded-lg border border-border-default bg-surface-card p-5">{children}</div>
      </div>
    </div>
  );
}
