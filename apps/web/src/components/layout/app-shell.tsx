'use client';

import {
  Boxes,
  CalendarClock,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Plus,
  Receipt,
  Settings,
  ShieldCheck,
  Tags,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { CurrentUserDto } from '@hisobai/contracts';

import { useLogout } from '../../features/auth/queries';
import { useTodayRate } from '../../features/exchange-rates/queries';
import { useShop } from '../../features/shops/queries';
import { Logo } from './logo';
import { RateBar } from './rate-bar';
import { ThemeToggle } from './theme-toggle';

/**
 * Ilova qobig'i (`FRONTEND.md` §4).
 *
 * Noutbukda chap yon menyuda **hamma** bo'lim ko'rinadi. Telefonda esa
 * pastda faqat beshta element bo'ladi — qolgani "Yana" varag'ida.
 * Sabab jismoniy: 375px kenglikda oltinchi elementdan boshlab bosish
 * maydoni 44px dan tor bo'lib qoladi (`design.md` §6) va yonidagini
 * bosib yuborish oson bo'ladi.
 *
 * Ro'yxat bosqichma-bosqich o'sadi: nasiya, to'lovlar, hisobotlar va
 * AI tahlil o'z bosqichlarida qo'shiladi (`TZ.md` §22).
 */
interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

/** Telefonda pastki qatorda turadigan to'rttasi + "Yana" (§4). */
const PRIMARY_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Boshqaruv', icon: LayoutDashboard },
  { href: '/sales', label: 'Savdo', icon: Receipt },
  { href: '/inventory', label: 'Ombor', icon: Boxes },
  { href: '/customers', label: 'Mijozlar', icon: Users },
];

/** "Yana" varag'idagilar; noutbukda ular ham yon menyuda turadi. */
const SECONDARY_NAV: NavItem[] = [
  /**
   * Nasiya "Yana" varag'ida: §4 pastki qatorda beshta element chegara
   * (`design.md` §6 — 375px da bosish maydoni 44px dan tor bo'lmasin).
   * Qarzdorlar ro'yxati kunlik emas, haftalik ish — kunlik savdo va
   * ombordan ustun qo'yish tartibni buzardi.
   */
  { href: '/installments', label: 'Nasiya', icon: CalendarClock },
  { href: '/products', label: 'Katalog', icon: Tags },
  { href: '/cashbook', label: 'Kassa', icon: Wallet },
  { href: '/settings', label: 'Sozlamalar', icon: Settings },
  { href: '/settings/security', label: 'Xavfsizlik', icon: ShieldCheck },
];

const NAV: NavItem[] = [...PRIMARY_NAV, ...SECONDARY_NAV];

export function AppShell({ user, children }: { user: CurrentUserDto; children: ReactNode }) {
  const pathname = usePathname();
  const active = activeHref(pathname);
  const router = useRouter();
  const logout = useLogout();
  const shop = useShop();
  const todayRate = useTodayRate();
  const [moreOpen, setMoreOpen] = useState(false);

  // Varaq bo'lim almashganda ochiq qolmasin — orqaga qaytishda ham
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

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
            <span className="text-sm text-text-secondary">{shop.data?.name ?? ''}</span>
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
                <NavLink item={item} active={active === item.href} />
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/*
        §14.6 — YAGONA suzuvchi tugma: "Yangi savdo". `FRONTEND.md` §4
        boshqa suzuvchi tugma qo'shishni taqiqlaydi, shuning uchun
        kalkulyator ham savdo formasidagi narx maydonining yonida
        turadi (§12.6), ekranda emas.

        Savdo formasining o'zida u ko'rinmaydi: o'sha sahifada tugma
        turgan joyni "Tasdiqlash" egallaydi va ikkitasi bir-birini
        bosib qolardi.
      */}
      {!pathname.startsWith('/sales/') && (
        <Link
          href="/sales/new"
          className="fixed right-4 bottom-20 inline-flex min-h-14 items-center gap-2 rounded-full bg-action px-5 text-sm font-semibold text-action-text shadow-lg md:bottom-6"
        >
          <Plus size={20} aria-hidden="true" />
          Yangi savdo
        </Link>
      )}

      {/* Telefonda pastki navigatsiya — beshta element (§4) */}
      <nav
        aria-label="Asosiy menyu"
        className="fixed inset-x-0 bottom-0 border-t border-border-default bg-surface-card md:hidden"
      >
        {moreOpen && (
          <ul className="m-0 flex list-none flex-col gap-1 border-b border-border-default p-2">
            {SECONDARY_NAV.map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={active === item.href} />
              </li>
            ))}
          </ul>
        )}

        <ul className="m-0 flex list-none justify-around p-0">
          {PRIMARY_NAV.map((item) => (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active === item.href ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs ${
                  active === item.href ? 'text-action' : 'text-text-secondary'
                }`}
              >
                <item.icon size={20} aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          ))}

          <li className="flex-1">
            <button
              type="button"
              onClick={() => {
                setMoreOpen((open) => !open);
              }}
              aria-expanded={moreOpen}
              className={`flex min-h-14 w-full flex-col items-center justify-center gap-1 text-xs ${
                moreOpen || SECONDARY_NAV.some((item) => item.href === active)
                  ? 'text-action'
                  : 'text-text-secondary'
              }`}
            >
              <MoreHorizontal size={20} aria-hidden="true" />
              Yana
            </button>
          </li>
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
 * Faol bo'lim — **eng aniq moslik**.
 *
 * Ikkita talab bir-biriga zid ko'rinadi va ikkalasi ham kerak:
 * `/products/new` da "Katalog" yonishi kerak (ichki sahifada menyu
 * bo'sh qolmasin), lekin `/settings/security` da "Sozlamalar" **va**
 * "Xavfsizlik" birgalikda yonmasligi kerak. Shuning uchun prefiks
 * bo'yicha mos keladiganlardan eng uzuni tanlanadi.
 */
function activeHref(pathname: string): string | null {
  let best: string | null = null;
  for (const item of NAV) {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (best === null || item.href.length > best.length)) best = item.href;
  }
  return best;
}
