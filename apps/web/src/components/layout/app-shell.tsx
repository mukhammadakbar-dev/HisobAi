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
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CurrentUserDto } from '@hisobai/contracts';

import { useLogout } from '../../features/auth/queries';
import { useTodayRate } from '../../features/exchange-rates/queries';
import { useShop } from '../../features/shops/queries';
import { ConfirmDialog } from '../ui/modal';
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
 */
interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

/**
 * Telefonda pastki qatorda turadigan to'rttasi + "Yana".
 *
 * Tartib do'kon egasining KUNLIK ishiga qarab tanlangan, bo'limlarning
 * mantiqiy kattaligiga emas: nasiya to'lovini qabul qilish, ombordan
 * mahsulot izlash va kassani yopish — kun davomida qayta-qayta
 * takrorlanadi. Savdo ro'yxati esa pastda turishi shart emas, chunki
 * yangi savdo suzuvchi tugmadan ochiladi va tugagan savdolarga kunda
 * bir marta qaraladi.
 */
const PRIMARY_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Boshqaruv', icon: LayoutDashboard },
  { href: '/installments', label: 'Nasiya', icon: CalendarClock },
  { href: '/inventory', label: 'Ombor', icon: Boxes },
  { href: '/cashbook', label: 'Kassa', icon: Wallet },
];

/** "Yana" varag'idagilar; noutbukda ular ham yon menyuda turadi. */
const SECONDARY_NAV: NavItem[] = [
  { href: '/sales', label: 'Savdo', icon: Receipt },
  { href: '/customers', label: 'Mijozlar', icon: Users },
  { href: '/reports', label: 'Hisobot', icon: BarChart3 },
  { href: '/products', label: 'Katalog', icon: Tags },
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
      {/*
        Sarlavha YOPISHQOQ. Ilgari u sahifa bilan birga tepaga chiqib
        ketardi va uzun ro'yxatda foydalanuvchi qaysi do'konda ishlayotgani
        hamda joriy kursni ko'rish uchun tepaga qaytishi kerak bo'lardi.
      */}
      <header className="sticky top-0 z-40 border-b border-border-default bg-surface-card">
        <div className="mx-auto flex w-full max-w-[1920px] items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3 md:px-7 lg:px-8">
          <Logo className="h-6 w-auto shrink-0 sm:h-7" />

          {/*
            Do'kon nomi endi TELEFONDA HAM ko'rinadi. Ilgari u `hidden
            sm:inline` edi va kichik ekranda foydalanuvchi qaysi do'kon
            ustida ishlayotganini umuman ko'rmasdi — bir necha do'koni
            bor egasi uchun bu xavfli.
          */}
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold text-text-primary sm:text-base">
              {shop.data?.name ?? ''}
            </span>
            <span className="truncate text-xs text-text-tertiary">{user.displayName}</span>
          </div>

          <RateBar data={todayRate.data} />

          <HeaderMenu
            onLogout={() => {
              setShowLogoutConfirm(true);
            }}
          />
        </div>
      </header>

      <ConfirmDialog
        open={showLogoutConfirm}
        onClose={() => {
          setShowLogoutConfirm(false);
        }}
        onConfirm={handleLogout}
        title="Tizimdan chiqish"
        description="Haqiqatan ham tizimdan chiqmoqchimisiz?"
        confirmLabel="Chiqish"
        destructive
        pending={logout.isPending}
        pendingLabel="Chiqilmoqda…"
      />

      {/*
        Pastki bo'shliq bir joyda hisoblanadi: pastki navigatsiya (56px) +
        suzuvchi tugma (56px) + oraliq (24px) + qurilmaning xavfsiz zonasi
        (iPhone'dagi uy chizig'i). Ilgari bu `pb-40` degan sehrli qiymat
        edi va xavfsiz zona umuman hisobga olinmasdi — natijada oxirgi
        qator uy chizig'i ostida qolardi.
      */}
      <div className="mx-auto flex w-full max-w-[1920px] gap-6 px-4 pt-6 pb-[calc(9rem+env(safe-area-inset-bottom))] md:px-6 md:pb-24 lg:px-8">
        {/* Planshet va noutbukda chap menyu */}
        <nav aria-label="Asosiy menyu" className="hidden w-52 shrink-0 md:block">
          <ul className="sticky top-24 flex list-none flex-col gap-1 p-0">
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
        boshqa suzuvchi tugma qo'shishni taqiqlaydi.
        Savdo formasining o'zida u ko'rinmaydi: o'sha sahifada pastda
        "Tasdiqlash" paneli turadi va ikkitasi bir-birini bosib qolardi.
      */}
      {!pathname.startsWith('/sales/') && (
        <Link
          href="/sales/new"
          className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] inline-flex min-h-14 items-center gap-2 rounded-full bg-action px-5 text-sm font-semibold text-action-text shadow-lg md:bottom-6"
        >
          <Plus size={20} aria-hidden="true" />
          Yangi savdo
        </Link>
      )}

      {/* Telefonda pastki navigatsiya — to'rtta bo'lim va "Yana" */}
      <nav
        aria-label="Asosiy menyu"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border-default bg-surface-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {moreOpen && (
          <ul className="m-0 flex max-h-[50dvh] list-none flex-col gap-1 overflow-y-auto border-b border-border-default p-2">
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
                  active === item.href ? 'font-semibold text-action' : 'text-text-secondary'
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
                  ? 'font-semibold text-action'
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

/**
 * Sarlavhadagi "⋯" menyusi.
 *
 * Ilgari mavzu tugmasi va "Chiqish" sarlavhada ochiq turardi va 390px
 * kenglikda logotip, do'kon nomi, kurs, mavzu va chiqish bitta qatorga
 * siqilib, do'kon nomi butunlay yashirilardi. Kunda bir marta bosiladigan
 * amallar menyuga yig'ildi — kurs esa ochiq qoldi, chunki u ma'lumot.
 */
function HeaderMenu({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Qo‘shimcha amallar"
        className="inline-flex size-9 items-center justify-center rounded-md border border-border-default text-text-secondary transition-colors hover:bg-surface-raised sm:size-11"
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 flex w-56 flex-col gap-1 rounded-lg border border-border-default bg-surface-card p-2 shadow-xl"
        >
          <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5">
            <span className="text-sm text-text-secondary">Mavzu</span>
            <ThemeToggle />
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-danger transition-colors hover:bg-surface-raised"
          >
            <LogOut size={16} aria-hidden="true" />
            Chiqish
          </button>
        </div>
      )}
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
