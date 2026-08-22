'use client';

import { BASE_CURRENCY, formatMoneyWithCurrency, formatPhone } from '@hisobai/contracts';
import type { CustomerSummaryDto } from '@hisobai/contracts';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Money } from '../../../components/money/money';
import { EmptyState, ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Button, Card } from '../../../components/ui';
import { DataList } from '../../../components/ui/data-list';
import { FilterBar, FilterChip, SearchInput } from '../../../components/ui/filters';
import { useCustomersInfinite } from '../../../features/customers/queries';
import { CUSTOMER_DEBT_STATUS_LABEL, CUSTOMER_DEBT_STATUS_TONE } from '../../../lib/labels';
import { EMPTY_MESSAGES } from '../../../lib/messages';

/**
 * Mijozlar ro'yxati (§6.4).
 *
 * Qidiruv serverda: ism `customers_full_name_trgm_idx` bo'yicha,
 * telefon esa raqamlar bo'yicha — ajratgichlar server tomonida
 * tozalanadi, ya'ni "90 123" ham, "901234567" ham topadi.
 *
 * Qarz ustuni — `CustomerListResponse` (§6.12, §9.8 kengaytma):
 * `totalDebt` sarlavhada, har qatorda `outstandingDebt`/`debtStatus`.
 * Sahifalash kursor bilan — "Yana yuklash" haqiqiy keyingi sahifani
 * so'raydi.
 */
type ActiveFilter = 'active' | 'archived' | 'all';

const STATUS_FILTERS: { value: ActiveFilter; label: string }[] = [
  { value: 'active', label: 'Faol' },
  { value: 'archived', label: 'Arxivda' },
  { value: 'all', label: 'Hammasi' },
];

export default function CustomersPage() {
  const router = useRouter();

  const [q, setQ] = useState('');
  const [isActive, setIsActive] = useState<ActiveFilter>('active');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [onlyDebt, setOnlyDebt] = useState(false);

  const customers = useCustomersInfinite({
    q: q.trim() === '' ? undefined : q.trim(),
    isActive,
    isFlagged: onlyFlagged ? 'true' : undefined,
    hasDebt: onlyDebt ? 'true' : undefined,
  });

  const pages = customers.data ?? [];
  const rows = pages.flatMap((page) => page.data);
  const firstPage = pages[0];
  const isFiltered = q.trim() !== '' || isActive !== 'active' || onlyFlagged || onlyDebt;

  const resetFilters = (): void => {
    setQ('');
    setIsActive('active');
    setOnlyFlagged(false);
    setOnlyDebt(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-semibold">Mijozlar</h1>
          <p className="m-0 text-text-secondary">Ism yoki telefon bo‘yicha qidiring.</p>
        </div>

        <Link
          href="/customers/new"
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-action px-4 text-sm font-semibold text-action-text hover:bg-action-hover"
        >
          <Plus size={16} aria-hidden="true" />
          Mijoz
        </Link>
      </header>

      <Card>
        <FilterBar
          count={
            customers.isPending || !firstPage
              ? undefined
              : `${firstPage.totalCount} ta mijoz · jami qarz ${formatMoneyWithCurrency(firstPage.totalDebt, BASE_CURRENCY)}`
          }
          onReset={isFiltered ? resetFilters : undefined}
          chips={
            <>
              {STATUS_FILTERS.map((filter) => (
                <FilterChip
                  key={filter.value}
                  active={isActive === filter.value}
                  dismissable={false}
                  onClick={() => {
                    setIsActive(filter.value);
                  }}
                >
                  {filter.label}
                </FilterChip>
              ))}

              {/* §6.9 — belgilash ogohlantiradi, taqiqlamaydi */}
              <FilterChip
                active={onlyFlagged}
                onClick={() => {
                  setOnlyFlagged((value) => !value);
                }}
              >
                Belgilangan
              </FilterChip>

              {/* §6.12 kengaytma — joriy qoldiq bo'yicha filtr */}
              <FilterChip
                active={onlyDebt}
                onClick={() => {
                  setOnlyDebt((value) => !value);
                }}
              >
                Qarzi bor
              </FilterChip>
            </>
          }
        >
          <SearchInput
            id="customers-q"
            label="Mijoz qidirish"
            value={q}
            onChange={setQ}
            placeholder="Ism yoki telefon"
          />
        </FilterBar>
      </Card>

      {customers.isPending && (
        <Card>
          <TableSkeleton rows={6} />
        </Card>
      )}

      {customers.isError && (
        <ErrorState
          error={customers.error}
          onRetry={() => {
            void customers.refetch();
          }}
        />
      )}

      {!customers.isPending && !customers.isError && rows.length === 0 && (
        <EmptyState
          title={isFiltered ? EMPTY_MESSAGES.filtered.title : EMPTY_MESSAGES.customers.title}
          // Bo'sh ekran keyingi qadamni aytadi (`design.md` §6) — lug'at
          // matnlari aynan shuning uchun yozilgan
          actionLabel={
            isFiltered ? EMPTY_MESSAGES.filtered.action : EMPTY_MESSAGES.customers.action
          }
          onAction={() => {
            if (!isFiltered) {
              router.push('/customers/new');
              return;
            }
            resetFilters();
          }}
        />
      )}

      {rows.length > 0 && (
        <DataList<CustomerSummaryDto>
          label="Mijozlar ro‘yxati"
          rows={rows}
          rowKey={(customer) => customer.id}
          onRowClick={(customer) => {
            router.push(`/customers/${customer.id}`);
          }}
          accent={(customer) => {
            if (!customer.isActive) return 'muted';
            if (customer.debtStatus === 'OVERDUE') return 'danger';
            return customer.isFlagged ? 'warning' : undefined;
          }}
          columns={[
            {
              header: 'Ism',
              mobile: 'primary',
              cell: (customer) => customer.fullName,
            },
            {
              header: 'Telefon',
              mobile: 'secondary',
              cell: (customer) => (
                <>
                  {formatPhone(customer.phonePrimary)}
                  {customer.phoneSecondary && (
                    <span className="block text-text-tertiary">
                      {formatPhone(customer.phoneSecondary)}
                    </span>
                  )}
                </>
              ),
            },
            {
              header: 'Qarz',
              mobile: 'amount',
              numeric: true,
              className: 'w-36',
              cell: (customer) => (
                <Money
                  amount={customer.outstandingDebt}
                  currency={BASE_CURRENCY}
                  withCurrency={false}
                  className={customer.debtStatus === 'OVERDUE' ? 'text-danger' : ''}
                />
              ),
            },
            {
              header: 'Holat',
              mobile: 'status',
              className: 'w-56',
              cell: (customer) => (
                <span className="flex flex-wrap gap-2">
                  <Badge tone={CUSTOMER_DEBT_STATUS_TONE[customer.debtStatus] ?? 'muted'}>
                    {CUSTOMER_DEBT_STATUS_LABEL[customer.debtStatus] ?? customer.debtStatus}
                  </Badge>
                  {customer.isFlagged && <Badge tone="warning">Ehtiyot bo‘ling</Badge>}
                  {!customer.isActive && <Badge tone="muted">Arxivda</Badge>}
                </span>
              ),
            },
          ]}
        />
      )}

      {customers.hasNextPage && (
        <Button
          type="button"
          onClick={() => {
            void customers.fetchNextPage();
          }}
          disabled={customers.isFetchingNextPage}
        >
          {customers.isFetchingNextPage
            ? 'Yuklanmoqda…'
            : `Yana ${(firstPage?.totalCount ?? rows.length) - rows.length} tasini yuklash`}
        </Button>
      )}
    </div>
  );
}
