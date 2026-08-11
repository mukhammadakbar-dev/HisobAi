'use client';

import { formatPhone } from '@hisobai/contracts';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { EmptyState, ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Card, Input, Select } from '../../../components/ui';
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
 * hisoblanadi va 5-bosqichda qo'shiladi. Bo'sh "0 so'm" ustuni
 * bo'lmagan raqamni haqiqatdek ko'rsatardi.
 */
export default function CustomersPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [isActive, setIsActive] = useState<'active' | 'archived' | 'all'>('active');
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const customers = useCustomers({
    q: q.trim() === '' ? undefined : q.trim(),
    isActive,
    isFlagged: onlyFlagged ? 'true' : undefined,
  });

  const rows = customers.data?.data ?? [];
  const isFiltered = q.trim() !== '' || isActive !== 'active' || onlyFlagged;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-semibold">Mijozlar</h1>
          <p className="m-0 text-text-secondary">
            Ism yoki telefon bo‘yicha qidiring — ikkala raqam ham qamraladi (§6.4).
          </p>
        </div>

        <Link
          href="/customers/new"
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-action px-4 text-sm font-semibold text-action-text hover:bg-action-hover"
        >
          <Plus size={16} aria-hidden="true" />
          Mijoz
        </Link>
      </header>

      <Card className="flex flex-wrap items-center gap-3">
        <div className="min-w-48 flex-2 basis-64">
          <label htmlFor="q" className="sr-only">
            Qidiruv
          </label>
          <Input
            id="q"
            type="search"
            inputMode="search"
            placeholder="Ism yoki telefon"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
            }}
          />
        </div>

        <div className="min-w-36 flex-1">
          <label htmlFor="isActive" className="sr-only">
            Holat
          </label>
          <Select
            id="isActive"
            value={isActive}
            onChange={(event) => {
              setIsActive(event.target.value as 'active' | 'archived' | 'all');
            }}
          >
            <option value="active">Faol</option>
            <option value="archived">Arxivda</option>
            <option value="all">Hammasi</option>
          </Select>
        </div>

        <label className="flex min-h-11 items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            className="size-4"
            checked={onlyFlagged}
            onChange={(event) => {
              setOnlyFlagged(event.target.checked);
            }}
          />
          Faqat belgilanganlar
        </label>
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
            setQ('');
            setIsActive('active');
            setOnlyFlagged(false);
          }}
        />
      )}

      {rows.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-default text-left text-text-secondary">
                <th className="p-3 font-medium">Ism</th>
                <th className="p-3 font-medium">Telefon</th>
                <th className="p-3 font-medium">Holat</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((customer) => (
                <tr key={customer.id} className="border-b border-border-default last:border-0">
                  <td className="p-3">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="font-medium text-link hover:underline"
                    >
                      {customer.fullName}
                    </Link>
                  </td>
                  <td className="tabular p-3 text-text-secondary">
                    {formatPhone(customer.phonePrimary)}
                    {customer.phoneSecondary && (
                      <div className="text-text-tertiary">
                        {formatPhone(customer.phoneSecondary)}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {/* §6.9 — ogohlantiradi, taqiqlamaydi */}
                      {customer.isFlagged && <Badge tone="warning">Ehtiyot bo‘ling</Badge>}
                      {!customer.isActive && <Badge tone="muted">Arxivda</Badge>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {customers.data?.hasMore && (
        <p className="m-0 text-sm text-text-tertiary">
          Birinchi {rows.length} ta ko‘rsatildi — qidiruv bilan toraytiring.
        </p>
      )}
    </div>
  );
}
