'use client';

import { InventoryStatus } from '@hisobai/contracts';
import { PackagePlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Money } from '../../../components/money/money';
import { EmptyState, ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Card, Input, Select } from '../../../components/ui';
import { useCurrentUser } from '../../../features/auth/queries';
import { useBatches, useInventoryItems } from '../../../features/inventory/queries';
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

  const rows = items.data?.data ?? [];
  const batchRows = batches.data?.data ?? [];
  const showCost = can(user.data, 'cost.view');

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

      <Card className="flex flex-wrap gap-3">
        <div className="min-w-48 flex-2 basis-64">
          <label htmlFor="q" className="sr-only">
            Qidiruv
          </label>
          <Input
            id="q"
            type="search"
            inputMode="search"
            placeholder="IMEI, seriya raqami yoki nom"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
            }}
          />
        </div>

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
            {Object.values(InventoryStatus).map((value) => (
              <option key={value} value={value}>
                {INVENTORY_STATUS_LABEL[value]}
              </option>
            ))}
            <option value="all">Barcha holat</option>
          </Select>
        </div>
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
        <Card className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-default text-left text-text-secondary">
                <th className="p-3 font-medium">Mahsulot</th>
                <th className="p-3 font-medium">Identifikator</th>
                <th className="p-3 font-medium">Holat</th>
                {showCost && <th className="p-3 text-right font-medium">Tannarx</th>}
                <th className="p-3 font-medium">Qabul</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id} className="border-b border-border-default last:border-0">
                  <td className="p-3">
                    <Link
                      href={`/inventory/${item.id}`}
                      className="font-medium text-link hover:underline"
                    >
                      {item.product.displayName}
                    </Link>
                  </td>
                  <td className="tabular p-3 text-text-secondary">
                    {item.imei1 ?? item.serialNumber ?? '—'}
                    {item.imei2 && <div className="text-text-tertiary">{item.imei2}</div>}
                  </td>
                  <td className="p-3">
                    <Badge tone={INVENTORY_STATUS_TONE[item.status] ?? 'muted'}>
                      {INVENTORY_STATUS_LABEL[item.status]}
                    </Badge>
                  </td>
                  {showCost && (
                    <td className="p-3 text-right">
                      <Money amount={item.costPrice} currency={item.costCurrency} />
                    </td>
                  )}
                  <td className="p-3 text-text-secondary">{formatDateTime(item.receivedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
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
          <Card className="overflow-x-auto p-0">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-default text-left text-text-secondary">
                  <th className="p-3 font-medium">Mahsulot</th>
                  <th className="p-3 text-right font-medium">Qoldiq</th>
                  {showCost && <th className="p-3 text-right font-medium">Donasiga</th>}
                  <th className="p-3 font-medium">Qabul</th>
                </tr>
              </thead>
              <tbody>
                {batchRows.map((batch) => (
                  <tr key={batch.id} className="border-b border-border-default last:border-0">
                    <td className="p-3">{batch.product.displayName}</td>
                    <td className="tabular p-3 text-right">
                      {batch.quantityRemaining} / {batch.quantityReceived}
                    </td>
                    {showCost && (
                      <td className="p-3 text-right">
                        <Money amount={batch.unitCost} currency={batch.costCurrency} />
                      </td>
                    )}
                    <td className="p-3 text-text-secondary">{formatDateTime(batch.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
