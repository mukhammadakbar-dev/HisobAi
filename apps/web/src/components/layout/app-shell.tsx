'use client';

import {
  BarChart3,
  Boxes,
  CalendarClock,
  ChevronDown,
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
 * mantiqiy kattaligiga emas. Savdo pastda turadi: kun davomida eng ko'p
 * ochiladigan ro'yxat shu — savdo tasdiqlangandan keyin unga qaytib
 * kiriladi, chek beriladi, qaytarish rasmiylashtiriladi.
 *
 * Kassa "Yana" ga tushdi: kassa kuniga bir-ikki marta, kun oxirida
 * yopiladi — pastki qatordagi doimiy o'rinni oqlamaydi.
 */
const PRIMARY_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Boshqaruv', icon: LayoutDashboard },
  { href: '/sales', label: 'Savdo', icon: Receipt },
  { href: '/installments', label: 'Nasiya', icon: CalendarClock },
  { href: '/inventory', label: 'Ombor', icon: Boxes },
];

/** "Yana" varag'idagilar; noutbukda ular ham yon menyuda turadi. */
const SECONDARY_NAV: NavItem[] = [
  { href: '/cashbook', label: 'Kassa', icon: Wallet },
  { href: '/customers', label: 'Mijozlar', icon: Users },
  { href: '/reports', label: 'Hisobot', icon: BarChart3 },
  { href: '/products', label: 'Katalog', icon: Tags },
  { href: '/settings', label: 'Sozlamalar', icon: Settings },
  { href: '/settings/security', label: 'Xavfsizlik', icon: ShieldCheck },
];

/**
 * Noutbukdagi yon menyu — guruhlangan.
 *
 * Asosiy ro'yxat sarlavhasiz: kunlik ishda ishlatiladigan bo'limlar
 * ("Boshqaruv" dan "Mijozlar"gacha) bitta uzluksiz ro'yxatda. Faqat
 * boshqaruv-xarakterdagi oxirgi uchtasi ("Hisobot", "Sozlamalar",
 * "Xavfsizlik") "Boshqarish" sarlavhasi ostida ajratiladi — ular
 * kundalik emas, davriy ochiladi.
 *
 * Pastki navigatsiya SHU manbadan olinmaydi — telefondagi tartib
 * boshqacha (PRIMARY_NAV) va u ataylab alohida turadi.
 */
interface NavGroup {
  title: string | null;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [
      { href: '/dashboard', label: 'Boshqaruv', icon: LayoutDashboard },
      { href: '/sales', label: 'Savdo', icon: Receipt },
      { href: '/installments', label: 'Nasiya', icon: CalendarClock },
      { href: '/cashbook', label: 'Kassa', icon: Wallet },
      { href: '/inventory', label: 'Ombor', icon: Boxes },
      { href: '/products', label: 'Katalog', icon: Tags },
      { href: '/customers', label: 'Mijozlar', icon: Users },
    ],
  },
  {
    title: 'Boshqarish',
    items: [
      { href: '/reports', label: 'Hisobot', icon: BarChart3 },
      { href: '/settings', label: 'Sozlamalar', icon: Settings },
      { href: '/settings/security', label: 'Xavfsizlik', icon: ShieldCheck },
    ],
  },
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
      <header className="sticky top-0 z-40 h-[52px] border-b border-border-default bg-surface-card md:h-[60px]">
        <div className="mx-auto flex h-full w-full max-w-[1920px] items-center gap-2.5 px-3.5 sm:gap-3 md:gap-4 md:px-6 lg:px-8">
          {/* Logotip belgisi — noutbukda "HisobAI" so'zi bilan */}
          <div className="flex shrink-0 items-center gap-2.5 md:w-[204px]">
            <div className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-action text-sm font-bold text-action-text md:size-8">
              H
            </div>
            <span className="hidden text-[17px] font-semibold tracking-tight md:inline">
              HisobAI
            </span>
          </div>

          {/*
            Do'kon nomi endi TELEFONDA HAM ko'rinadi. Ilgari u `hidden
            sm:inline` edi va kichik ekranda foydalanuvchi qaysi do'kon
            ustida ishlayotganini umuman ko'rmasdi — bir necha do'koni
            bor egasi uchun bu xavfli.
          */}
          <div className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="truncate text-[15px] leading-tight font-semibold text-text-primary md:text-sm">
              {shop.data?.name ?? ''}
            </span>
            <span className="truncate text-[11px] text-text-tertiary md:text-xs">
              {user.displayName}
            </span>
          </div>

          <RateBar data={todayRate.data} />

          <HeaderMenu
            user={user}
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
      <div className="mx-auto flex w-full max-w-[1920px] gap-6 px-4 pt-6 pb-[calc(9rem+env(safe-area-inset-bottom))] md:px-6 md:pb-10 lg:px-8">
        {/* Planshet va noutbukda chap menyu */}
        <nav aria-label="Asosiy menyu" className="hidden w-52 shrink-0 md:block">
          <div className="sticky top-24 flex flex-col gap-4">
            {/*
              §14.6 — YAGONA "Yangi savdo" havolasi: telefonda suzuvchi
              tugma, noutbukda esa yon menyuning boshida — ikkalasi bir
              vaqtda ko'rinmaydi, `FRONTEND.md` §4 buzilmaydi.
            */}
            <Link
              href="/sales/new"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-action text-sm font-semibold text-action-text hover:bg-action-hover"
            >
              <Plus size={18} aria-hidden="true" />
              Yangi savdo
            </Link>

            {NAV_GROUPS.map((group) => (
              <div key={group.title ?? 'main'} className="flex flex-col gap-1">
                {group.title && (
                  <div className="px-3 text-xs font-semibold tracking-[0.08em] text-text-tertiary uppercase">
                    {group.title}
                  </div>
                )}
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <NavLink item={item} active={active === item.href} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/*
        §14.6 — YAGONA suzuvchi tugma: "Yangi savdo". `FRONTEND.md` §4
        boshqa suzuvchi tugma qo'shishni taqiqlaydi.
        Savdo formasining o'zida u ko'rinmaydi: o'sha sahifada pastda
        "Tasdiqlash" paneli turadi va ikkitasi bir-birini bosib qolardi.
        Noutbukda yon menyu boshidagi havola shu vazifani bajaradi.
      */}
      {!pathname.startsWith('/sales/') && (
        <Link
          href="/sales/new"
          className="fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] inline-flex min-h-[52px] items-center gap-2 rounded-full bg-action px-5 text-[15px] font-semibold text-action-text shadow-[0_6px_20px_rgba(2,13,31,0.3)] md:hidden"
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
function HeaderMenu({ user, onLogout }: { user: CurrentUserDto; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const initials = initialsOf(user.displayName);

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
      {/* Telefon va planshetda — nuqtali tugma */}
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Qo‘shimcha amallar"
        className="inline-flex size-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-raised md:hidden"
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>

      {/* Noutbukda — avatar va ism */}
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Foydalanuvchi menyusi"
        className="hidden items-center gap-2 rounded-md py-1 pr-1 pl-1 text-sm font-medium text-text-primary transition-colors hover:bg-surface-raised md:inline-flex"
      >
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-row-selected text-[13px] font-bold text-action">
          {initials}
        </span>
        <span className="max-w-32 truncate">{user.displayName}</span>
        <ChevronDown size={15} aria-hidden="true" className="shrink-0 text-text-tertiary" />
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
      className={`flex min-h-[42px] items-center gap-2.5 rounded-md px-3 text-sm ${
        active
          ? 'bg-row-selected font-semibold text-action'
          : 'font-medium text-text-secondary hover:bg-surface-raised'
      }`}
    >
      <item.icon size={18} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

/** Sarlavhadagi avatar uchun ism boshharflari — "Aziza Karimova" → "AK". */
function initialsOf(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '');
  return letters.join('') || '?';
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
