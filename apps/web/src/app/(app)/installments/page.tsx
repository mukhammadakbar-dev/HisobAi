'use client';

import { ContractStatus } from '@hisobai/contracts';
import Link from 'next/link';
import { useState } from 'react';

import { Money } from '../../../components/money/money';
import { EmptyState, ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Card, Select } from '../../../components/ui';
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
export default function InstallmentsPage() {
  const [filters, setFilters] = useState<InstallmentFilters>({ status: ContractStatus.ACTIVE });
  const contracts = useInstallments(filters);

  const rows = contracts.data?.data ?? [];
  const overdue = rows.filter((row) => row.isOverdue).length;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-semibold">Nasiya</h1>
          <p className="m-0 text-sm text-text-secondary">
            Shartnomalar va qarz qoldig‘i. Kechikish ogohlantirish sifatida ko‘rsatiladi (§9.9).
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select
            id="status-filter"
            aria-label="Holat"
            value={filters.status ?? ''}
            onChange={(event) => {
              setFilters((current) => ({
                ...current,
                status: event.target.value === '' ? undefined : event.target.value,
              }));
            }}
          >
            <option value={ContractStatus.ACTIVE}>Faol</option>
            <option value={ContractStatus.CLOSED}>Yopilgan</option>
            <option value={ContractStatus.CANCELLED}>Bekor qilingan</option>
            <option value="">Hammasi</option>
          </Select>

          <Select
            id="overdue-filter"
            aria-label="Kechikish"
            value={filters.overdue ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              setFilters((current) => ({
                ...current,
                overdue: value === '' ? undefined : (value as 'true' | 'false'),
              }));
            }}
          >
            <option value="">Kechikishdan qat‘i nazar</option>
            <option value="true">Faqat kechikkanlar</option>
            <option value="false">Kechikmaganlar</option>
          </Select>
        </div>
      </header>

      {overdue > 0 && (
        <p className="m-0 rounded-md bg-warning-bg p-3 text-sm text-warning" role="status">
          {overdue} ta shartnomada muddati o‘tgan to‘lov bor.
        </p>
      )}

      <Card className="p-0">
        {contracts.isPending && (
          <div className="p-4">
            <TableSkeleton rows={5} />
          </div>
        )}

        {contracts.isError && (
          <div className="p-4">
            <ErrorState
              error={contracts.error}
              onRetry={() => {
                void contracts.refetch();
              }}
            />
          </div>
        )}

        {contracts.isSuccess && rows.length === 0 && (
          <div className="p-4">
            <EmptyState title="Nasiya savdo rasmiylashtirilganda shartnoma shu yerda paydo bo‘ladi" />
          </div>
        )}

        {contracts.isSuccess && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-default text-left text-text-secondary">
                  <th className="p-3 font-medium">Mijoz</th>
                  <th className="p-3 font-medium">Savdo</th>
                  <th className="p-3 font-medium">Qarz</th>
                  <th className="p-3 font-medium">Qoldiq</th>
                  <th className="p-3 font-medium">Keyingi to‘lov</th>
                  <th className="p-3 font-medium">Holat</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border-default last:border-0">
                    <td className="p-3">
                      <Link href={`/installments/${row.id}`} className="text-link">
                        {row.customerName ?? '—'}
                      </Link>
                    </td>
                    <td className="tabular p-3 text-text-secondary">{row.saleNumber ?? '—'}</td>
                    <td className="tabular p-3">
                      <Money amount={row.principal} currency={row.currency} withCurrency={false} />
                    </td>
                    <td className="tabular p-3 font-medium">
                      <Money
                        amount={row.outstanding}
                        currency={row.currency}
                        withCurrency={false}
                      />
                    </td>
                    <td className="tabular p-3">
                      {row.nextDueDate === null ? (
                        <span className="text-text-tertiary">—</span>
                      ) : (
                        <>
                          {formatDate(row.nextDueDate)}
                          {row.isOverdue && <span className="ml-2 text-danger">kechikkan</span>}
                        </>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge tone={CONTRACT_STATUS_TONE[row.status] ?? 'muted'}>
                        {CONTRACT_STATUS_LABEL[row.status] ?? row.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {contracts.data?.hasMore === true && (
        <p className="m-0 text-sm text-text-tertiary">
          Birinchi {rows.length} ta shartnoma ko‘rsatildi — filtr bilan toraytiring.
        </p>
      )}
    </div>
  );
}
