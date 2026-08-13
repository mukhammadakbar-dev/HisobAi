'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';

import { AccountsCard } from '../../../features/cashbook/components/accounts-card';
import { EntriesTable } from '../../../features/cashbook/components/entries-table';

/**
 * Kassa (§11).
 *
 * "Savdo ma'lumoti va haqiqiy pul — bir xil narsa emas" (TZ §13):
 * bu sahifa faqat **pulni** ko'rsatadi. Savdo aylanmasi va foyda
 * hisobotlar bo'limida qoladi (§13.2), aks holda ikkalasi aralashib,
 * "bugun qancha ishladim" degan savolga ikki xil javob chiqardi.
 */
export default function CashbookPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-semibold">Kassa</h1>
          <p className="m-0 text-text-secondary">
            Kassaga pul faqat to‘lov orqali tushadi; qolgan kirim-chiqim qo‘lda yoziladi (§17.2).
          </p>
        </div>

        <Link
          href="/cashbook/new"
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-action px-4 text-sm font-semibold text-action-text hover:bg-action-hover"
        >
          <Plus size={16} aria-hidden="true" />
          Kirim / chiqim
        </Link>
      </header>

      <AccountsCard />
      <EntriesTable />
    </div>
  );
}
