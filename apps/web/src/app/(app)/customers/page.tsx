'use client';

import { formatPhone } from '@hisobai/contracts';
import type { CustomerSummaryDto } from '@hisobai/contracts';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { EmptyState, ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Card } from '../../../components/ui';
import { DataList } from '../../../components/ui/data-list';
import { FilterBar, FilterChip, SearchInput } from '../../../components/ui/filters';
import { useCustomers } from '../../../features/customers/queries';
import { EMPTY_MESSAGES } from '../../../lib/messages';

/**
 * Mijozlar ro'yxati (§6.4).
 *
 * Qidiruv serverda: ism `customers_full_name_trgm_idx` bo'yicha,
 * telefon esa raqamlar bo'yicha — ajratgichlar server tomonida
 * tozalanadi, ya'ni "90 123" ham, "901234567" ham topadi.
 *
 * Qarz ustuni yo'q (§6.11, §6.12): u savdo va to'lovlardan
 * hisoblanadi va alohida bosqichda qo'shiladi. Bo'sh "0 so'm" ustuni
 * bo'lmagan raqamni haqiqatdek ko'rsatardi.
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

  const customers = useCustomers({
    q: q.trim() === '' ? undefined : q.trim(),
    isActive,
    isFlagged: onlyFlagged ? 'true' : undefined,
  });

  const rows = customers.data?.data ?? [];
  const isFiltered = q.trim() !== '' || isActive !== 'active' || onlyFlagged;

  const resetFilters = (): void => {
    setQ('');
    setIsActive('active');
    setOnlyFlagged(false);
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
            customers.isPending
              ? undefined
              : `${rows.length} ta mijoz${customers.data?.hasMore === true ? ' (birinchi sahifa)' : ''}`
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
              header: 'Holat',
              mobile: 'status',
              className: 'w-56',
              cell: (customer) => (
                <span className="flex flex-wrap gap-2">
                  {customer.isFlagged && <Badge tone="warning">Ehtiyot bo‘ling</Badge>}
                  {!customer.isActive && <Badge tone="muted">Arxivda</Badge>}
                </span>
              ),
            },
          ]}
        />
      )}

      {/*
        Bu yerda "yana yuklash" tugmasi ATAYLAB yo'q: ro'yxat so'rovi
        kursor qaytarmaydi, ya'ni keyingi sahifani so'rashning yo'li yo'q.
        Soxta tugma qo'yish ishlamaydigan narsani ishlaydigandek
        ko'rsatardi — o'rniga nima qilish kerakligi aytiladi.
      */}
      {customers.data?.hasMore === true && (
        <p className="m-0 text-sm text-text-tertiary">
          Birinchi {rows.length} ta ko‘rsatildi — qidiruv bilan toraytiring.
        </p>
      )}
    </div>
  );
}
