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
  DashboardPeriod,
} from '@hisobai/contracts';
import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { Badge, Button, Card } from '../../../components/ui';
import { EmptyState, ErrorState, Skeleton } from '../../../components/states';
import { useCurrentUser } from '../../../features/auth/queries';
import { MetricDelta } from '../../../features/dashboard/components/metric-delta';
import { DashboardPeriodPicker } from '../../../features/dashboard/components/period-picker';
import { RevenueChart } from '../../../features/dashboard/components/revenue-chart';
import { useDashboard } from '../../../features/dashboard/queries';
import { comparisonLabel, revenueTileLabel, summarizeCash } from '../../../features/dashboard/utils';
import { CASH_ACCOUNT_KIND_LABEL } from '../../../lib/labels';
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
  // §14 kengaytma — davr URL emas, mahalliy holat (`/reports` dagi
  // `PeriodPicker` bilan bir naqsh): davr faqat shu sahifada ishlatiladi
  // va boshqa ekrandan havola qilinmaydi.
  const [period, setPeriod] = useState<DashboardPeriod>('today');
  const dashboard = useDashboard(period);
  const data = dashboard.data;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-semibold">Boshqaruv</h1>
          <p className="m-0 text-sm text-text-secondary">
            {formatDate(data?.date ?? new Date().toISOString())}
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

      <DashboardPeriodPicker period={period} onChange={setPeriod} />

      {dashboard.isPending && <DashboardSkeleton />}

      {dashboard.isError && (
        <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
      )}

      {data && (
        <DashboardBlocks data={data} period={period} canSeeCash={can(user.data, 'cashbook.view')} />
      )}
    </div>
  );
}

function DashboardBlocks({
  data,
  period,
  canSeeCash,
}: {
  data: DashboardDto;
  period: DashboardPeriod;
  canSeeCash: boolean;
}) {
  const showCash = canSeeCash && data.cashAccounts !== null;
  const cashGroups = showCash ? summarizeCash(data.cashAccounts ?? []) : [];
  // Bosh KPI plitasi — bazaviy valyutadagi (dashboard valyutasi) guruh,
  // aks holda birinchi mavjud guruh
  const primaryCash = cashGroups.find((group) => group.currency === data.currency) ?? cashGroups[0];

  return (
    <>
      {/* §14.3 — birinchi ekran: kompakt KPI plitalari */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
        <KpiTile
          label={revenueTileLabel(period)}
          value={formatMoneyWithCurrency(data.sales.revenue.value, data.currency)}
          delta={
            <span className="flex flex-col gap-0.5">
              <MetricDelta metric={data.sales.revenue} comparisonLabel={comparisonLabel(period)} />
              {data.sales.profit !== null && (
                <span className="text-xs text-text-tertiary">
                  Foyda {formatMoneyWithCurrency(data.sales.profit, data.currency)}
                </span>
              )}
            </span>
          }
        />
        <KpiTile
          label="Savdolar"
          value={data.sales.count.value}
          delta={<MetricDelta metric={data.sales.count} comparisonLabel={comparisonLabel(period)} />}
        />
        {showCash && primaryCash && (
          <KpiTile
            label="Kassa qoldig'i"
            value={formatMoneyWithCurrency(primaryCash.total, primaryCash.currency)}
            delta={
              <span className="text-xs text-text-tertiary">
                {primaryCash.byKind
                  .map((row) => `${row.label} ${formatMoneyWithCurrency(row.total, primaryCash.currency)}`)
                  .join(' · ')}
              </span>
            }
          />
        )}
        <KpiTile
          label="Muddati o'tgan qarz"
          value={
            data.overdue.customersCount > 0
              ? formatMoneyWithCurrency(data.overdue.totalAmount.value, data.currency)
              : '0'
          }
          delta={
            data.overdue.customersCount > 0 ? (
              <span className="flex flex-col gap-0.5">
                <span>{data.overdue.customersCount} ta mijoz</span>
                <MetricDelta metric={data.overdue.totalAmount} comparisonLabel={comparisonLabel(period)} />
              </span>
            ) : (
              <span className="text-xs text-text-tertiary">Yo‘q</span>
            )
          }
          tone={data.overdue.customersCount > 0 ? 'danger' : undefined}
        />
      </div>

      {/* Grafik va e'tibor navbati — noutbukda yonma-yon, telefonda ustma-ust */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Block title="Tushum dinamikasi" subtitle={chartRangeLabel(data.chart, period)}>
          <RevenueChart points={data.chart} currency={data.currency} />
        </Block>
        <AttentionBlock
          overdue={data.overdue}
          lowStock={data.inventory.lowStock}
          currency={data.currency}
        />
      </div>

      {/* §14.3 — bugun/ertaga to'lov va kassa qoldig'i */}
      <div className="grid gap-4 md:grid-cols-2">
        <DuePaymentsBlock payments={data.duePayments} />
        {showCash && <CashBlock accounts={data.cashAccounts ?? []} />}
      </div>

      {/* §14.4 — ombor va so'nggi amallar */}
      <div className="grid gap-4 md:grid-cols-2">
        <InventoryBlock inventory={data.inventory} currency={data.currency} />
        <ActivityBlock activity={data.recentActivity} />
      </div>
    </>
  );
}

/**
 * Grafik ustidagi oraliq matni — `chart[]` ning haqiqiy birinchi/oxirgi kuni.
 * "Bugun"/"Shu hafta" davrlarida backend bir xil 7 kunlik trendni qaytaradi
 * (bitta kunlik grafik "dinamika" sifatida ma'nosiz), shuning uchun bu ikki
 * holatda oraliq yoniga izoh qo'shiladi — aks holda davr chipini almashtirganda
 * sarlavha o'zgarmagandek ko'rinadi.
 */
function chartRangeLabel(
  points: DashboardDto['chart'],
  period: DashboardPeriod,
): string | undefined {
  if (points.length === 0) return undefined;
  const first = points[0]?.date;
  const last = points[points.length - 1]?.date;
  if (!first || !last) return undefined;
  const range = first === last ? formatDate(first) : `${formatDate(first)} — ${formatDate(last)}`;
  return period === 'month' ? range : `${range} (so'nggi 7 kun)`;
}

// ───────────────────────────── §14.3 bloklari ─────────────────────────────

/**
 * Kompakt KPI plitasi (dizayn kanvasi — "Boshqaruv paneli").
 *
 * Katta blok o'rniga kichik karta: yorliq, tabular raqam, bitta qisqa
 * qator. `delta` — davr o'zgarishi (`MetricDelta`) yoki oddiy izoh matni.
 */
function KpiTile({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta?: ReactNode;
  tone?: 'danger';
}) {
  return (
    <Card className="flex flex-col gap-1.5 p-3 md:p-4">
      <span className="text-[10px] font-semibold tracking-[0.06em] text-text-tertiary uppercase md:text-[11px]">
        {label}
      </span>
      <span
        className={`tabular text-xl font-semibold tracking-tight md:text-2xl ${tone === 'danger' ? 'text-danger' : 'text-text-primary'}`}
      >
        {value}
      </span>
      {delta}
    </Card>
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
            label={`${account.name} · ${CASH_ACCOUNT_KIND_LABEL[account.kind] ?? account.kind}`}
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
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.slice(0, ATTENTION_LIMIT).map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className={`flex items-center gap-3 rounded-lg border border-border-default bg-surface-raised p-3 ${
                item.tone === 'danger' ? 'border-l-3 border-l-danger' : 'border-l-3 border-l-warning'
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
                {item.title}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                {item.amount && (
                  <span
                    className={`tabular text-sm font-semibold ${item.tone === 'danger' ? 'text-danger' : 'text-warning'}`}
                  >
                    {item.amount}
                  </span>
                )}
                <Badge tone={item.tone}>{item.badge}</Badge>
              </span>
            </Link>
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
  subtitle,
  href,
  linkLabel,
  className = '',
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="m-0 text-sm font-semibold text-text-secondary">{title}</h2>
          {subtitle && <p className="m-0 text-xs text-text-tertiary">{subtitle}</p>}
        </div>
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
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 md:gap-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
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
