'use client';

import { InventoryStatus } from '@hisobai/contracts';
import type { InventoryBatchDto, InventoryItemDto } from '@hisobai/contracts';
import { PackagePlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Money } from '../../../components/money/money';
import { EmptyState, ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Card } from '../../../components/ui';
import { DataList } from '../../../components/ui/data-list';
import { FilterBar, FilterChip, SearchInput } from '../../../components/ui/filters';
import { useCurrentUser } from '../../../features/auth/queries';
import { useBatches, useInventoryItems } from '../../../features/inventory/queries';
import { useInventoryValue } from '../../../features/reports/queries';
import { formatDateTime } from '../../../lib/format';
import { EMPTY_MESSAGES } from '../../../lib/messages';
import { INVENTORY_STATUS_LABEL, INVENTORY_STATUS_TONE } from '../../../lib/labels';
import { can } from '../../../lib/permissions';

/**
 * Ombor (§5.1–§5.3).
 *
 * Ikkita ro'yxat ataylab bitta sahifada: seriyali birliklar va
 * miqdorli partiyalar bir xil savolga javob beradi — "omborda nima
 * bor". Ular ikki ekranga bo'linsa, ega qaysi biriga qarashni har safar
 * o'ylab ko'rishi kerak bo'lardi.
 */
const STATUS_FILTERS: { value: string; label: string }[] = [
  ...Object.values(InventoryStatus).map((value) => ({
    value,
    label: INVENTORY_STATUS_LABEL[value] ?? value,
  })),
  { value: 'all', label: 'Hammasi' },
];

export default function InventoryPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>(InventoryStatus.AVAILABLE);

  const user = useCurrentUser();
  const items = useInventoryItems({
    q: q.trim() === '' ? undefined : q.trim(),
    status: status === 'all' ? undefined : status,
  });
  const batches = useBatches();
  const value = useInventoryValue();

  const rows = items.data?.data ?? [];
  const batchRows = batches.data?.data ?? [];
  const showCost = can(user.data, 'cost.view');
  const isFiltered = q.trim() !== '' || status !== InventoryStatus.AVAILABLE;

  const resetFilters = (): void => {
    setQ('');
    setStatus(InventoryStatus.AVAILABLE);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-semibold">Ombor</h1>
          <p className="m-0 text-text-secondary">
            IMEI, seriya raqami yoki nom bo‘yicha qidiring.
          </p>
        </div>

        <Link
          href="/inventory/receive"
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-action px-4 text-sm font-semibold text-action-text hover:bg-action-hover"
        >
          <PackagePlus size={16} aria-hidden="true" />
          Qabul qilish
        </Link>
      </header>

      {/* §5.9 — bugungi do'kon kursida baholanadi, ro'yxat filtridan mustaqil */}
      {showCost && value.isSuccess && (
        <p className="m-0 text-sm text-text-secondary">
          {value.data.positionCount} ta pozitsiya · ombor qiymati{' '}
          <Money amount={value.data.totalCost} currency={value.data.currency} className="font-medium" />
          {value.data.rateMissing && (
            <span className="ml-2 text-warning">valyuta kursi yo‘q — to‘liq emas</span>
          )}
        </p>
      )}

      <Card>
        <FilterBar
          count={items.isPending ? undefined : `${rows.length} ta birlik`}
          onReset={isFiltered ? resetFilters : undefined}
          chips={STATUS_FILTERS.map((filter) => (
            <FilterChip
              key={filter.value}
              active={status === filter.value}
              dismissable={false}
              onClick={() => {
                setStatus(filter.value);
              }}
            >
              {filter.label}
            </FilterChip>
          ))}
        >
          <SearchInput
            id="inventory-q"
            label="Ombor qidirish"
            value={q}
            onChange={setQ}
            placeholder="IMEI, seriya raqami yoki nom"
          />
        </FilterBar>
      </Card>

      {items.isPending && (
        <Card>
          <TableSkeleton rows={6} />
        </Card>
      )}

      {items.isError && (
        <ErrorState
          error={items.error}
          onRetry={() => {
            void items.refetch();
          }}
        />
      )}

      {!items.isPending && !items.isError && rows.length === 0 && (
        <EmptyState
          title={
            q.trim() === '' && status === InventoryStatus.AVAILABLE
              ? EMPTY_MESSAGES.inventory.title
              : 'Bu shart bo‘yicha topilmadi'
          }
          actionLabel={
            q.trim() === '' && status === InventoryStatus.AVAILABLE
              ? EMPTY_MESSAGES.inventory.action
              : undefined
          }
          onAction={() => {
            router.push('/inventory/receive');
          }}
        />
      )}

      {rows.length > 0 && (
        <DataList<InventoryItemDto>
          label="Ombor birliklari"
          rows={rows}
          rowKey={(item) => item.id}
          onRowClick={(item) => {
            router.push(`/inventory/${item.id}`);
          }}
          accent={(item) => INVENTORY_STATUS_TONE[item.status]}
          columns={[
            {
              header: 'Mahsulot',
              mobile: 'primary',
              cell: (item) => item.product.displayName,
            },
            {
              header: 'Identifikator',
              mobile: 'secondary',
              className: 'w-56',
              cell: (item) => (
                <>
                  {item.imei1 ?? item.serialNumber ?? '—'}
                  {item.imei2 && <span className="block text-text-tertiary">{item.imei2}</span>}
                </>
              ),
            },
            {
              header: 'Holat',
              mobile: 'status',
              className: 'w-36',
              cell: (item) => (
                <Badge tone={INVENTORY_STATUS_TONE[item.status] ?? 'muted'}>
                  {INVENTORY_STATUS_LABEL[item.status]}
                </Badge>
              ),
            },
            // Tannarx faqat ruxsati borga ko'rinadi (`PERMISSIONS.md`)
            ...(showCost
              ? [
                  {
                    header: 'Tannarx',
                    mobile: 'amount' as const,
                    numeric: true,
                    className: 'w-40',
                    cell: (item: InventoryItemDto) => (
                      <Money amount={item.costPrice} currency={item.costCurrency} />
                    ),
                  },
                ]
              : []),
            {
              header: 'Qabul',
              className: 'w-48',
              cell: (item) => (
                <span className="text-text-secondary">{formatDateTime(item.receivedAt)}</span>
              ),
            },
          ]}
        />
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="m-0 text-lg font-semibold">Partiyalar</h2>
          {/* Partiya filtri serverda yo'q — qidiruv faqat birliklarga tegadi */}
          <span className="text-sm text-text-tertiary">yuqoridagi filtrdan mustaqil</span>
        </div>

        {batches.isPending && (
          <Card>
            <TableSkeleton rows={3} />
          </Card>
        )}

        {/* Xato "bo'sh" deb ko'rsatilmaydi: ega omborni bo'sh deb o'ylardi */}
        {batches.isError && (
          <ErrorState
            error={batches.error}
            onRetry={() => {
              void batches.refetch();
            }}
          />
        )}

        {!batches.isPending && !batches.isError && batchRows.length === 0 && (
          <EmptyState title="Miqdorli mahsulot partiyasi yo‘q" />
        )}

        {batchRows.length > 0 && (
          <DataList<InventoryBatchDto>
            label="Mahsulot partiyalari"
            rows={batchRows}
            rowKey={(batch) => batch.id}
            columns={[
              {
                header: 'Mahsulot',
                mobile: 'primary',
                cell: (batch) => batch.product.displayName,
              },
              {
                header: 'Qoldiq',
                mobile: 'amount',
                numeric: true,
                className: 'w-36',
                cell: (batch) => `${batch.quantityRemaining} / ${batch.quantityReceived}`,
              },
              ...(showCost
                ? [
                    {
                      header: 'Donasiga',
                      mobile: 'secondary' as const,
                      numeric: true,
                      className: 'w-40',
                      cell: (batch: InventoryBatchDto) => (
                        <Money amount={batch.unitCost} currency={batch.costCurrency} />
                      ),
                    },
                  ]
                : []),
              {
                header: 'Qabul',
                className: 'w-48',
                cell: (batch) => (
                  <span className="text-text-secondary">{formatDateTime(batch.receivedAt)}</span>
                ),
              },
            ]}
          />
        )}
      </section>
    </div>
  );
}
