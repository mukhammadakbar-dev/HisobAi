'use client';

import { LayoutDashboard, LogOut, Settings, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import type { CurrentUserDto } from '@hisobai/contracts';

import { useLogout } from '../../features/auth/queries';
import { useTodayRate } from '../../features/exchange-rates/queries';
import { useSettings } from '../../features/settings/queries';
import { Logo } from './logo';
import { RateBar } from './rate-bar';
import { ThemeToggle } from './theme-toggle';

/**
 * Ilova qobig'i (`FRONTEND.md` §4).
 *
 * Telefonda pastki navigatsiya, noutbukda chap yon menyu. Hozir
 * bo'limlar kam — 2-bosqichda faqat boshqaruv va sozlamalar bor;
 * qolganlari o'z bosqichida qo'shiladi va shu ro'yxatga tushadi.
 *
 * "Yangi savdo" suzuvchi tugmasi (§14.6) 5-bosqichda qo'shiladi —
 * savdo formasi paydo bo'lgandan keyin, aks holda u hech qayerga
 * olib bormaydigan tugma bo'lardi.
 */
interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Boshqaruv', icon: LayoutDashboard },
  { href: '/settings', label: 'Sozlamalar', icon: Settings },
  { href: '/settings/security', label: 'Xavfsizlik', icon: ShieldCheck },
];

export function AppShell({ user, children }: { user: CurrentUserDto; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useLogout();
  const settings = useSettings();
  const todayRate = useTodayRate();

  const handleLogout = (): void => {
    logout.mutate(undefined, {
      // Xato bo'lsa ham `/login` ga o'tamiz: serverdagi sessiya baribir
      // yaroqsiz bo'lishi mumkin, foydalanuvchini ekranda qamab qo'ymaymiz
      onSettled: () => router.push('/login'),
    });
  };

  return (
    <div className="min-h-dvh bg-surface-page">
      <header className="border-b border-border-default bg-surface-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo className="h-7 w-auto" />
            <span className="text-sm text-text-secondary">{settings.data?.shopName ?? ''}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-text-secondary sm:inline">{user.displayName}</span>
            <ThemeToggle />
            <button
              type="button"
              onClick={handleLogout}
              disabled={logout.isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border-default px-3 text-sm font-semibold text-text-primary disabled:opacity-50"
            >
              <LogOut size={16} aria-hidden="true" />
              Chiqish
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-4">
        <RateBar data={todayRate.data} />
      </div>

      <div className="mx-auto flex max-w-5xl gap-6 px-4 pb-24 md:pb-8">
        {/* Noutbukda chap menyu */}
        <nav aria-label="Asosiy menyu" className="hidden w-52 shrink-0 md:block">
          <ul className="flex list-none flex-col gap-1 p-0">
            {NAV.map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={isActive(pathname, item.href)} />
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* Telefonda pastki navigatsiya */}
      <nav
        aria-label="Asosiy menyu"
        className="fixed inset-x-0 bottom-0 border-t border-border-default bg-surface-card md:hidden"
      >
        <ul className="m-0 flex list-none justify-around p-0">
          {NAV.map((item) => (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs ${
                  isActive(pathname, item.href) ? 'text-action' : 'text-text-secondary'
                }`}
              >
                <item.icon size={20} aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium ${
        active ? 'bg-row-selected text-action' : 'text-text-secondary hover:bg-surface-raised'
      }`}
    >
      <item.icon size={18} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

/**
 * `/settings` `/settings/security` ochiq bo'lganda faol bo'lib
 * qolmasligi kerak — aks holda ikkita element bir vaqtda tanlangan
 * ko'rinadi va foydalanuvchi qayerdaligini bilmaydi.
 */
function isActive(pathname: string, href: string): boolean {
  return pathname === href;
}
