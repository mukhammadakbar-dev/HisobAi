'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { AppShell } from '../../components/layout/app-shell';
import { ErrorState, TableSkeleton } from '../../components/states';
import { useCurrentUser } from '../../features/auth/queries';

/**
 * Sessiya darvozasi: bu guruhdagi hamma narsa kirishni talab qiladi.
 *
 * Server baribir har so'rovni tekshiradi (`RolesGuard` — default DENY),
 * shuning uchun bu qatlam **himoya emas**, qulaylik: sessiyasiz
 * foydalanuvchi bo'sh jadvallar va xato bannerlari o'rniga to'g'ridan-to'g'ri
 * `/login` ga tushadi.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const user = useCurrentUser();

  const isUnauthenticated = user.error?.status === 401;

  useEffect(() => {
    // `replace` — "orqaga" tugmasi himoyalangan sahifaga qaytarmasin
    if (isUnauthenticated) router.replace('/login');
  }, [isUnauthenticated, router]);

  if (user.isPending || isUnauthenticated) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <TableSkeleton rows={4} />
      </div>
    );
  }

  /**
   * `401` dan boshqa xato — tarmoq uzilishi yoki server yiqilishi.
   * Bunda `/login` ga otish noto'g'ri bo'lardi: sessiya joyida, muammo
   * vaqtinchalik. Foydalanuvchiga qayta urinish beriladi.
   */
  if (user.isError) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <ErrorState
          error={user.error}
          onRetry={() => {
            void user.refetch();
          }}
        />
      </div>
    );
  }

  return <AppShell user={user.data}>{children}</AppShell>;
}
