'use client';

import {
  BarChart3,
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
import { Button } from '../ui';
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
  { href: '/reports', label: 'Hisobot', icon: BarChart3 },
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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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
        <div className="mx-auto flex w-full max-w-[1920px] items-center justify-between gap-2 px-3 sm:px-4 md:px-7 lg:px-8 py-2.5 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <Logo className="h-6 sm:h-7 w-auto" />
            <span className="hidden text-xs text-text-secondary sm:inline md:text-sm">{shop.data?.name ?? ''}</span>
          </div>

          <div className="flex flex-row items-center gap-1.5 sm:gap-3 md:gap-5 lg:gap-6 whitespace-nowrap">
            <RateBar data={todayRate.data} />
            <span className="hidden text-sm text-text-secondary sm:inline">{user.displayName}</span>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => {
                setShowLogoutConfirm(true);
              }}
              disabled={logout.isPending}
              className="inline-flex min-h-9 sm:min-h-11 items-center gap-1.5 sm:gap-2 rounded-md border border-border-default px-2.5 sm:px-3 text-xs sm:text-sm font-semibold text-text-primary whitespace-nowrap disabled:opacity-50"
            >
              <LogOut size={15} aria-hidden="true" className="shrink-0" />
              <span>Chiqish</span>
            </button>
          </div>
        </div>
      </header>

      {showLogoutConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border-default bg-surface-card p-5 shadow-xl">
            <div className="flex flex-col gap-1">
              <h3 id="logout-dialog-title" className="m-0 text-lg font-semibold text-text-primary">
                Tizimdan chiqish
              </h3>
              <p className="m-0 text-sm text-text-secondary">
                Haqiqatan ham tizimdan chiqmoqchimisiz?
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowLogoutConfirm(false);
                }}
                disabled={logout.isPending}
              >
                Bekor qilish
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleLogout}
                disabled={logout.isPending}
              >
                {logout.isPending ? 'Chiqilmoqda…' : 'Chiqish'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/*
        Pastki bo'shliq suzuvchi tugmadan KATTA bo'lishi shart. U `fixed`
        va noutbukda pastdan 24px da turadi, balandligi 56px — ya'ni
        oxirgi 80px kontentni to'sadi. Ilgari bu yerda `md:pb-8` (32px)
        edi va sahifa oxiridagi tugma yoki matn tugma ostida qolib
        ketardi (nasiya shartnomasidagi "Erta yopish" kartasida
        ko'rindi). Telefonda esa tugma pastki navigatsiya ustida
        (`bottom-20`), shuning uchun bo'shliq yanada kattaroq.
      */}
      <div className="mx-auto flex w-full max-w-[1920px] gap-6 px-4 md:px-6 lg:px-8 pt-6 pb-40 md:pb-24">
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
