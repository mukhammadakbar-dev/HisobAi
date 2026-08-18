'use client';

import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { Logo } from '../../components/layout/logo';
import { ThemeToggle } from '../../components/layout/theme-toggle';
import { ErrorState, TableSkeleton } from '../../components/states';
import { usePlatformAdmin, usePlatformLogout } from '../../features/platform/queries';

/**
 * Platforma paneli qobig'i (§25.4, `ARCHITECTURE.md` §14.3).
 *
 * `AppShell` **ishlatilmaydi** va bu ataylab: u `useShop()` orqali
 * `GET /shops/me` so'raydi, kurs chizig'ini chizadi va "Yangi savdo"
 * tugmasini ko'rsatadi — SUPERADMIN uchun ularning **hech biri
 * mavjud emas** (§25.3: platforma darajasidagi hisob tenant biznes
 * ma'lumotiga umuman kira olmaydi). Umumiy qobiqni "rejim" bayrog'i
 * bilan ikkiga bo'lish shu chegarani kod ichida xiralashtirardi.
 *
 * Darvoza `(app)` dagi bilan bir xil mulohazada: server baribir har
 * so'rovni `PlatformSessionGuard` bilan tekshiradi, shuning uchun bu
 * qatlam himoya emas — sessiyasiz foydalanuvchi bo'sh jadval va xato
 * banneri o'rniga to'g'ridan-to'g'ri kirish sahifasiga tushadi.
 */
const NAV = [
  { href: '/superadmin', label: 'Boshqaruv' },
  { href: '/superadmin/accounts', label: 'Hisoblar' },
];

export default function SuperadminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const admin = usePlatformAdmin();
  const logout = usePlatformLogout();

  const isUnauthenticated = admin.error?.status === 401;

  useEffect(() => {
    if (isUnauthenticated) router.replace('/superadmin/login');
  }, [isUnauthenticated, router]);

  if (admin.isPending || isUnauthenticated) {
    return (
      <div className="mx-auto w-full max-w-[1920px] px-4 md:px-6 lg:px-8 py-10">
        <TableSkeleton rows={4} />
      </div>
    );
  }

  if (admin.isError) {
    return (
      <div className="mx-auto w-full max-w-[1920px] px-4 md:px-6 lg:px-8 py-10">
        <ErrorState
          error={admin.error}
          onRetry={() => {
            void admin.refetch();
          }}
        />
      </div>
    );
  }

  const onLogout = (): void => {
    logout.mutate(undefined, {
      onSuccess: () => {
        router.replace('/superadmin/login');
      },
    });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-surface-page">
      <header className="border-b border-border-default bg-surface-card">
        <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-center gap-4 px-4 md:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-auto" />
            <span className="rounded-md bg-info-bg px-2 py-0.5 text-xs font-semibold text-info">
              Platforma
            </span>
          </div>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const isActive =
                item.href === '/superadmin'
                  ? pathname === '/superadmin'
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium ${
                    isActive
                      ? 'bg-muted-bg text-text-primary'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-text-secondary sm:inline">
              {admin.data.displayName}
            </span>
            <ThemeToggle />
            <button
              type="button"
              onClick={onLogout}
              disabled={logout.isPending}
              aria-label="Chiqish"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-text-secondary hover:text-text-primary"
            >
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1920px] flex-1 px-4 md:px-6 lg:px-8 py-6">{children}</main>
    </div>
  );
}
