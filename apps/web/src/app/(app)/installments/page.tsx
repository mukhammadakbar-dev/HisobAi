'use client';

import { ContractStatus } from '@hisobai/contracts';
import type { InstallmentSummaryDto } from '@hisobai/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Money } from '../../../components/money/money';
import { EmptyState, ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Card } from '../../../components/ui';
import { DataList } from '../../../components/ui/data-list';
import { FilterBar, FilterChip } from '../../../components/ui/filters';
import { formatDate } from '../../../lib/format';
import { CONTRACT_STATUS_LABEL, CONTRACT_STATUS_TONE } from '../../../lib/labels';
import { useInstallments, type InstallmentFilters } from '../../../features/installments/queries';

/**
 * Qarzdorlar ro'yxati (§9).
 *
 * Standart filtr — **faol shartnomalar**: yopilgan va bekor qilinganlar
 * kundalik ishda kerak emas va ular ro'yxatni to'ldirib, kechikkan
 * qarzdorni ko'rinmas qilib qo'yardi.
 *
 * §9.9 — jarima yo'q: kechikish faqat belgi bilan ko'rsatiladi.
 */
const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: ContractStatus.ACTIVE, label: 'Faol' },
  { value: ContractStatus.CLOSED, label: 'Yopilgan' },
  { value: ContractStatus.CANCELLED, label: 'Bekor qilingan' },
  { value: '', label: 'Hammasi' },
];

export default function InstallmentsPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<InstallmentFilters>({ status: ContractStatus.ACTIVE });
  const contracts = useInstallments(filters);

  const rows = contracts.data?.data ?? [];
  // §9.8 — butun filtrlangan to'plam bo'yicha, joriy sahifadagi emas
  const overdue = contracts.data?.overdueCount ?? 0;
  const isFiltered = (filters.status ?? '') !== ContractStatus.ACTIVE || filters.overdue !== undefined;

  const resetFilters = (): void => {
    setFilters({ status: ContractStatus.ACTIVE });
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-semibold">Nasiya</h1>
        <p className="m-0 text-sm text-text-secondary">
          Shartnomalar va qarz qoldig‘i. Kechikish ogohlantirish sifatida ko‘rsatiladi (§9.9).
        </p>
      </header>

      <Card>
        <FilterBar
          count={contracts.isPending ? undefined : `${rows.length} ta shartnoma`}
          onReset={isFiltered ? resetFilters : undefined}
          chips={
            <>
              {STATUS_FILTERS.map((filter) => (
                <FilterChip
                  key={filter.value}
                  active={(filters.status ?? '') === filter.value}
                  dismissable={false}
                  onClick={() => {
                    setFilters((current) => ({
                      ...current,
                      status: filter.value === '' ? undefined : filter.value,
                    }));
                  }}
                >
                  {filter.label}
                </FilterChip>
              ))}

              <FilterChip
                active={filters.overdue === 'true'}
                onClick={() => {
                  setFilters((current) => ({
                    ...current,
                    overdue: current.overdue === 'true' ? undefined : 'true',
                  }));
                }}
              >
                Faqat kechikkanlar
              </FilterChip>
            </>
          }
        />
      </Card>

      {overdue > 0 && (
        <p className="m-0 rounded-md bg-warning-bg p-3 text-sm text-warning" role="status">
          {overdue} ta shartnomada muddati o‘tgan to‘lov bor.
        </p>
      )}

      {contracts.isPending && (
        <Card>
          <TableSkeleton rows={5} />
        </Card>
      )}

      {contracts.isError && (
        <ErrorState
          error={contracts.error}
          onRetry={() => {
            void contracts.refetch();
          }}
        />
      )}

      {contracts.isSuccess && rows.length === 0 && (
        <EmptyState title="Nasiya savdo rasmiylashtirilganda shartnoma shu yerda paydo bo‘ladi" />
      )}

      {contracts.isSuccess && rows.length > 0 && (
        <DataList<InstallmentSummaryDto>
          label="Nasiya shartnomalari"
          rows={rows}
          rowKey={(row) => row.id}
          onRowClick={(row) => {
            router.push(`/installments/${row.id}`);
          }}
          /**
           * Kechikkan shartnoma holatidan qat'i nazar qizil chekka
           * oladi: ro'yxatda uni birinchi bo'lib ko'rish kerak.
           */
          accent={(row) => (row.isOverdue ? 'danger' : CONTRACT_STATUS_TONE[row.status])}
          columns={[
            {
              header: 'Mijoz',
              mobile: 'primary',
              cell: (row) => row.customerName ?? '—',
            },
            {
              header: 'Savdo',
              mobile: 'secondary',
              className: 'w-32',
              cell: (row) => row.saleNumber ?? '—',
            },
            {
              header: 'Qarz',
              numeric: true,
              className: 'w-36',
              cell: (row) => (
                <Money amount={row.principal} currency={row.currency} withCurrency={false} />
              ),
            },
            {
              header: 'Qoldiq',
              mobile: 'amount',
              numeric: true,
              className: 'w-36',
              cell: (row) => (
                <Money amount={row.outstanding} currency={row.currency} withCurrency={false} />
              ),
            },
            {
              header: 'Keyingi to‘lov',
              className: 'w-44',
              cell: (row) =>
                row.nextDueDate === null ? (
                  <span className="text-text-tertiary">—</span>
                ) : (
                  <span className="tabular">
                    {formatDate(row.nextDueDate)}
                    {row.isOverdue && <span className="ml-2 text-danger">kechikkan</span>}
                  </span>
                ),
            },
            {
              header: 'Holat',
              mobile: 'status',
              className: 'w-40',
              cell: (row) => (
                <Badge tone={row.isOverdue ? 'danger' : (CONTRACT_STATUS_TONE[row.status] ?? 'muted')}>
                  {row.isOverdue
                    ? 'Muddati o‘tgan'
                    : (CONTRACT_STATUS_LABEL[row.status] ?? row.status)}
                </Badge>
              ),
            },
          ]}
        />
      )}

      {contracts.data?.hasMore === true && (
        <p className="m-0 text-sm text-text-tertiary">
          Birinchi {rows.length} ta shartnoma ko‘rsatildi — filtr bilan toraytiring.
        </p>
      )}
    </div>
  );
}
