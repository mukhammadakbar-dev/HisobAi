'use client';

import { SaleStatus, formatMoneyWithCurrency } from '@hisobai/contracts';
import type { SaleSummaryDto } from '@hisobai/contracts';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { EmptyState, ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Card, Input, Select } from '../../../components/ui';
import { DataList } from '../../../components/ui/data-list';
import { FilterBar } from '../../../components/ui/filters';
import { useSales } from '../../../features/sales/queries';
import { formatDate } from '../../../lib/format';
import { SALE_STATUS_LABEL, SALE_STATUS_TONE } from '../../../lib/labels';
import { EMPTY_MESSAGES } from '../../../lib/messages';

/**
 * Savdolar ro'yxati (§7).
 *
 * Qoralamalar ham shu ro'yxatda: ular hech narsaga ta'sir qilmaydi
 * (§7.7), lekin ega ularni topa olishi kerak — aks holda yarim
 * to'ldirilgan savat ko'rinmas bo'lib qolardi. Raqam faqat
 * tasdiqlangan savdoda bo'ladi (§17.1), shuning uchun qoralama
 * ustunida chiziqcha turadi.
 */
export default function SalesPage() {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const sales = useSales({
    status: status === '' ? undefined : status,
    from: from === '' ? undefined : from,
    to: to === '' ? undefined : to,
  });

  const rows = sales.data?.data ?? [];
  const isFiltered = status !== '' || from !== '' || to !== '';

  const resetFilters = (): void => {
    setStatus('');
    setFrom('');
    setTo('');
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-semibold">Savdo</h1>
          <p className="m-0 text-text-secondary">
            Qoralama istalgancha o‘zgaradi; tasdiqlangan savdo esa faqat qaytarish bilan tuzatiladi
            (§7).
          </p>
        </div>

        <Link
          href="/sales/new"
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-action px-4 text-sm font-semibold text-action-text hover:bg-action-hover"
        >
          <Plus size={16} aria-hidden="true" />
          Yangi savdo
        </Link>
      </header>

      <Card>
        <FilterBar
          count={sales.isPending ? undefined : `${rows.length} ta savdo`}
          onReset={isFiltered ? resetFilters : undefined}
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-40 flex-1">
              <label htmlFor="status" className="sr-only">
                Holat
              </label>
              <Select
                id="status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                }}
              >
                <option value="">Barcha holatlar</option>
                {Object.values(SaleStatus).map((value) => (
                  <option key={value} value={value}>
                    {SALE_STATUS_LABEL[value]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="min-w-36 flex-1">
              <label htmlFor="from" className="sr-only">
                Boshlanish sanasi
              </label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                }}
              />
            </div>

            <div className="min-w-36 flex-1">
              <label htmlFor="to" className="sr-only">
                Tugash sanasi
              </label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                }}
              />
            </div>
          </div>
        </FilterBar>
      </Card>

      {sales.isPending && (
        <Card>
          <TableSkeleton rows={6} />
        </Card>
      )}

      {sales.isError && (
        <ErrorState
          error={sales.error}
          onRetry={() => {
            void sales.refetch();
          }}
        />
      )}

      {!sales.isPending && !sales.isError && rows.length === 0 && (
        <EmptyState
          title={isFiltered ? EMPTY_MESSAGES.filtered.title : EMPTY_MESSAGES.sales.title}
          actionLabel={isFiltered ? EMPTY_MESSAGES.filtered.action : EMPTY_MESSAGES.sales.action}
          onAction={() => {
            if (!isFiltered) {
              router.push('/sales/new');
              return;
            }
            resetFilters();
          }}
        />
      )}

      {rows.length > 0 && (
        <DataList<SaleSummaryDto>
          label="Savdolar ro‘yxati"
          rows={rows}
          rowKey={(sale) => sale.id}
          onRowClick={(sale) => {
            router.push(`/sales/${sale.id}`);
          }}
          accent={(sale) => SALE_STATUS_TONE[sale.status]}
          columns={[
            {
              header: 'Raqam',
              mobile: 'primary',
              cell: (sale) => (
                <span className="tabular">
                  {sale.number ?? 'Qoralama'}
                  <span className="block text-xs font-normal text-text-tertiary">
                    {sale.itemCount} qator
                  </span>
                </span>
              ),
            },
            {
              header: 'Sana',
              mobile: 'secondary',
              className: 'w-36',
              cell: (sale) => formatDate(sale.soldAt),
            },
            {
              header: 'Mijoz',
              cell: (sale) =>
                sale.customerName ?? <span className="text-text-tertiary">—</span>,
            },
            {
              header: 'Summa',
              mobile: 'amount',
              numeric: true,
              className: 'w-44',
              cell: (sale) => formatMoneyWithCurrency(sale.total, sale.currency),
            },
            {
              header: 'Holat',
              mobile: 'status',
              className: 'w-40',
              cell: (sale) => (
                <Badge tone={SALE_STATUS_TONE[sale.status] ?? 'muted'}>
                  {SALE_STATUS_LABEL[sale.status] ?? sale.status}
                </Badge>
              ),
            },
          ]}
        />
      )}

      {sales.data?.hasMore && (
        <p className="m-0 text-sm text-text-tertiary">
          Birinchi {rows.length} ta ko‘rsatildi — sana bo‘yicha toraytiring.
        </p>
      )}
    </div>
  );
}
