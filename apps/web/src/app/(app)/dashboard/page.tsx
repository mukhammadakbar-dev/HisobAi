'use client';

import { formatMoneyWithCurrency, formatPhone } from '@hisobai/contracts';
import type {
  Currency,
  DashboardActivityDto,
  DashboardCashAccountDto,
  DashboardDto,
  DashboardDuePaymentDto,
  DashboardInventoryDto,
  DashboardLowStockDto,
  DashboardOverdueDto,
  DashboardSalesDto,
} from '@hisobai/contracts';
import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Badge, Button, Card } from '../../../components/ui';
import { EmptyState, ErrorState, Skeleton } from '../../../components/states';
import { useCurrentUser } from '../../../features/auth/queries';
import { RevenueChart } from '../../../features/dashboard/components/revenue-chart';
import { useDashboard } from '../../../features/dashboard/queries';
import { formatDate, formatDateTime, todayInShopZone } from '../../../lib/format';
import { can } from '../../../lib/permissions';

/**
 * Boshqaruv sahifasi (§14).
 *
 * Tuzilishi TZ §16 talab qilgan tartibda: birinchi ekranda bugungi
 * savdo va foyda, bugun/ertaga to'lovi keladiganlar va kassadagi pul
 * (§14.3); pastroqda muddati o'tgan qarzlar, ombor, grafik va so'nggi
 * amallar (§14.4).
 *
 * Ma'lumot **bitta so'rovdan** keladi (§14.1, `useDashboard`) va
 * avtomatik yangilanmaydi (§14.7): telefonda pastga tortish brauzerning
 * o'z yangilashini, noutbukda esa sarlavhadagi "Yangilash" tugmasi
 * so'rovni qaytadan yuboradi.
 *
 * Bugungi kurs bu sahifada takrorlanmaydi: u `AppShell` dagi kurs
 * chizig'ida, barcha sahifalar tepasida turadi (§14.5).
 *
 * "Yangi savdo" suzuvchi tugmasi (§14.6) bu sahifada emas, `AppShell`
 * da: u barcha ekranlarda pastda suzib turadi.
 */
export default function DashboardPage() {
  const user = useCurrentUser();
  const dashboard = useDashboard();
  const data = dashboard.data;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-semibold">Boshqaruv</h1>
          <p className="m-0 text-sm text-text-secondary">
            {/* §14.2 — faqat bugungi kun; kengroq davr `/reports` da */}
            Bugun, {formatDate(data?.date ?? new Date().toISOString())}
          </p>
        </div>

        <Button
          type="button"
          onClick={() => void dashboard.refetch()}
          disabled={dashboard.isFetching}
          aria-label="Ma'lumotni yangilash"
        >
          <RefreshCw
            size={16}
            aria-hidden="true"
            className={`mr-2 ${dashboard.isFetching ? 'animate-spin' : ''}`}
          />
          Yangilash
        </Button>
      </header>

      {dashboard.isPending && <DashboardSkeleton />}

      {dashboard.isError && (
        <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
      )}

      {data && <DashboardBlocks data={data} canSeeCash={can(user.data, 'cashbook.view')} />}
    </div>
  );
}

function DashboardBlocks({ data, canSeeCash }: { data: DashboardDto; canSeeCash: boolean }) {
  const showCash = canSeeCash && data.cashAccounts !== null;

  return (
    <>
      {/* §14.3 — birinchi ekran */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SalesBlock sales={data.sales} currency={data.currency} />
        <DuePaymentsBlock payments={data.duePayments} />
        {showCash && <CashBlock accounts={data.cashAccounts ?? []} />}
      </div>

      {/* §14.4 — pastroqda, lekin dashboard'da qoladi */}
      <div className="grid gap-4 md:grid-cols-2">
        <AttentionBlock
          overdue={data.overdue}
          lowStock={data.inventory.lowStock}
          currency={data.currency}
        />
        <InventoryBlock inventory={data.inventory} currency={data.currency} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 2xl:grid-cols-4">
        <Block title="So'nggi 14 kun savdosi" className="lg:col-span-2 2xl:col-span-3">
          <RevenueChart points={data.chart} currency={data.currency} />
        </Block>
        <ActivityBlock activity={data.recentActivity} />
      </div>
    </>
  );
}

// ───────────────────────────── §14.3 bloklari ─────────────────────────────

function SalesBlock({ sales, currency }: { sales: DashboardSalesDto; currency: Currency }) {
  return (
    <Block title="Bugungi savdo">
      <p className="m-0 text-3xl font-semibold tracking-tight">
        {formatMoneyWithCurrency(sales.revenue, currency)}
      </p>
      <dl className="m-0 flex flex-col gap-1 text-sm">
        <Row label="Savdolar soni" value={String(sales.count)} />
        {/* `PERMISSIONS.md` P7 — `SELLER` da `profit: null`, qator umuman chiqmaydi */}
        {sales.profit !== null && (
          <Row label="Foyda" value={formatMoneyWithCurrency(sales.profit, currency)} />
        )}
      </dl>
    </Block>
  );
}

function DuePaymentsBlock({ payments }: { payments: DashboardDuePaymentDto[] }) {
  if (payments.length === 0) {
    return (
      <Block title="Bugun va ertaga to'lov">
        <EmptyState title="Bugun va ertaga to'lovi keladigan mijoz yo'q." />
      </Block>
    );
  }

  return (
    <Block title="Bugun va ertaga to'lov">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {payments.slice(0, 5).map((payment) => (
          <li key={payment.installmentId} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 flex-col">
              <Link
                href={`/customers/${payment.customerId}`}
                className="truncate text-sm font-medium text-link"
              >
                {payment.customerName}
              </Link>
              {/*
                Raqam `tel:` havolasi: eslatma ko'rganda ega telefonni
                qo'lda terib o'tirmaydi, bir bosishda qo'ng'iroq qiladi.
                Bu maydon serverdan kelardi-yu, hech qayerda ko'rsatilmasdi.
              */}
              {payment.phone !== '' && (
                <a
                  href={`tel:${payment.phone}`}
                  className="tabular truncate text-xs text-text-tertiary hover:text-link"
                >
                  {formatPhone(payment.phone)}
                </a>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-sm">
              {formatMoneyWithCurrency(payment.amount, payment.currency)}
              <Badge tone={isToday(payment.dueDate) ? 'warning' : 'info'}>
                {isToday(payment.dueDate) ? 'Bugun' : 'Ertaga'}
              </Badge>
            </span>
          </li>
        ))}
      </ul>
      {payments.length > 5 && (
        <p className="m-0 text-sm text-text-tertiary">Yana {payments.length - 5} ta</p>
      )}
    </Block>
  );
}

function CashBlock({ accounts }: { accounts: DashboardCashAccountDto[] }) {
  if (accounts.length === 0) {
    return (
      <Block title="Kassadagi pul">
        <EmptyState title="Kassa hisobi hali ochilmagan." />
      </Block>
    );
  }

  return (
    <Block title="Kassadagi pul">
      <dl className="m-0 flex flex-col gap-1 text-sm">
        {accounts.map((account) => (
          <Row
            key={account.id}
            label={account.name}
            value={formatMoneyWithCurrency(account.balance, account.currency)}
          />
        ))}
      </dl>
    </Block>
  );
}

// ───────────────────────────── §14.4 bloklari ─────────────────────────────

/** Bitta ustuvor navbatdagi qator — qarz ham, ombor ham shu shaklga tushadi. */
interface AttentionItem {
  key: string;
  href: string;
  title: string;
  /** Faqat qarzda bo'ladi; ombor qatorida pul yo'q. */
  amount?: string;
  badge: string;
  tone: 'danger' | 'warning';
}

/** Telefonda kartani cheksiz cho'zmaslik uchun (eng yomon holat 5 + 5). */
const ATTENTION_LIMIT = 6;

/**
 * §14.4 — "E'tibor talab qiladi".
 *
 * Ilgari bu ikkita alohida karta edi: "Muddati o'tgan qarzlar" va
 * "Ombor" ichidagi kam qoldiq ro'yxati. Ega esa ikkalasini alohida
 * o'qib, o'zi ustuvorlik qo'yishi kerak edi. Endi bitta navbat, va
 * TARTIBNING O'ZI ustuvorlik: kechikkan pul birinchi, kam qolgan tovar
 * keyin — birinchisi bugun yo'qotilayotgan pul, ikkinchisi ertaga
 * yo'qotilishi mumkin bo'lgan savdo.
 *
 * Ma'lumot takrorlanmasligi uchun eski `OverdueBlock` olib tashlandi va
 * kam qoldiq ro'yxati `InventoryBlock` dan chiqarildi.
 */
function AttentionBlock({
  overdue,
  lowStock,
  currency,
}: {
  overdue: DashboardOverdueDto;
  lowStock: DashboardLowStockDto[];
  currency: Currency;
}) {
  const items: AttentionItem[] = [
    ...overdue.top.map((row) => ({
      key: `debt-${row.customerId}`,
      href: `/customers/${row.customerId}`,
      title: row.customerName,
      amount: formatMoneyWithCurrency(row.amount, currency),
      badge: `${row.daysOverdue} kun`,
      tone: 'danger' as const,
    })),
    ...lowStock.map((row) => ({
      key: `stock-${row.productId}`,
      href: `/products/${row.productId}`,
      title: row.productName,
      badge: `${row.quantity} dona`,
      // Tugagan tovar — kechikkan qarz bilan bir darajada shoshilinch
      tone: row.quantity === 0 ? ('danger' as const) : ('warning' as const),
    })),
  ];

  if (items.length === 0) {
    return (
      <Block title="E'tibor talab qiladi">
        <EmptyState title="Hammasi joyida — kechikkan qarz ham, kam qolgan mahsulot ham yo'q." />
      </Block>
    );
  }

  return (
    <Block title="E'tibor talab qiladi" href="/reports/debts" linkLabel="Qarzdorlar">
      {overdue.customersCount > 0 && (
        <>
          <p className="m-0 text-2xl font-semibold text-danger">
            {formatMoneyWithCurrency(overdue.totalAmount, currency)}
          </p>
          <p className="m-0 text-sm text-text-secondary">
            {overdue.customersCount} ta mijoz kechikkan
          </p>
        </>
      )}

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.slice(0, ATTENTION_LIMIT).map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-2">
            <Link href={item.href} className="min-w-0 truncate text-sm font-medium text-link">
              {item.title}
            </Link>
            <span className="flex shrink-0 items-center gap-2 text-sm">
              {item.amount}
              <Badge tone={item.tone}>{item.badge}</Badge>
            </span>
          </li>
        ))}
      </ul>
    </Block>
  );
}

function InventoryBlock({
  inventory,
  currency,
}: {
  inventory: DashboardInventoryDto;
  currency: Currency;
}) {
  return (
    <Block title="Ombor" href="/inventory" linkLabel="Omborga">
      <dl className="m-0 flex flex-col gap-1 text-sm">
        <Row label="Sotuvga tayyor" value={`${inventory.availableCount} dona`} />
        {/* Tannarx — `SELLER` da `null` (P7) */}
        {inventory.totalCost !== null && (
          <Row
            label="Ombor qiymati"
            value={formatMoneyWithCurrency(inventory.totalCost, currency)}
          />
        )}
      </dl>
      {/*
        Kam qolgan mahsulotlar ro'yxati bu yerdan olib tashlandi — u endi
        "E'tibor talab qiladi" navbatida, kechikkan qarz bilan birga.
        Bir xil ma'lumot ikki joyda turmasligi kerak.
      */}
    </Block>
  );
}

function ActivityBlock({ activity }: { activity: DashboardActivityDto[] }) {
  if (activity.length === 0) {
    return (
      <Block title="So'nggi amallar">
        <EmptyState title="Bugun hali amal bajarilmagan." />
      </Block>
    );
  }

  return (
    <Block title="So'nggi amallar">
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {activity.slice(0, 8).map((item) => (
          <li key={item.id} className="flex flex-col gap-0.5">
            <span className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{item.title}</span>
              {item.amount !== null && item.currency !== null && (
                <span className="shrink-0 font-medium">
                  {formatMoneyWithCurrency(item.amount, item.currency)}
                </span>
              )}
            </span>
            <span className="text-xs text-text-tertiary">{formatDateTime(item.at)}</span>
          </li>
        ))}
      </ul>
    </Block>
  );
}

// ───────────────────────────── Umumiy qismlar ─────────────────────────────

/**
 * Blok qobig'i.
 *
 * `FRONTEND.md` §7 dagi "qisman xato" qoidasi shu yerdan boshlanadi:
 * har blok o'z holatini (bo'sh yoki to'la) mustaqil ko'rsatadi,
 * bittasida ma'lumot bo'lmasa qolgani joyida qoladi.
 */
function Block({
  title,
  href,
  linkLabel,
  className = '',
  children,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-semibold text-text-secondary">{title}</h2>
        {href && linkLabel && (
          <Link href={href} className="text-sm text-link">
            {linkLabel}
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="min-w-0 truncate text-text-secondary">{label}</dt>
      <dd className="m-0 shrink-0 font-medium">{value}</dd>
    </div>
  );
}

/**
 * Yuklanish holati (`FRONTEND.md` §7) — bloklar to'ridagi skeleton.
 *
 * Shakl haqiqiy joylashuvni takrorlaydi: ma'lumot kelganda sahifa
 * sakramaydi.
 */
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Yuklanmoqda">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3 2xl:grid-cols-4">
        <Skeleton className="h-52 lg:col-span-2 2xl:col-span-3" />
        <Skeleton className="h-52" />
      </div>
    </div>
  );
}

/**
 * To'lov bugungimi yoki ertagami — badge matni uchun (§14.3).
 *
 * Taqqoslash **do'kon zonasida**: `toISOString()` UTC beradi va
 * Toshkentda ertalab soat 05:00 gacha kechagi sanani ko'rsatardi —
 * ya'ni bugungi to'lov "Ertaga" deb belgilanib qolardi.
 */
function isToday(dueDate: string): boolean {
  return dueDate === todayInShopZone();
}
