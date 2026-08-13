'use client';

import Link from 'next/link';

import { CashEntryForm } from '../../../../features/cashbook/components/cash-entry-form';

/** Qo'lda kirim yoki chiqim (§11.9) — sahifada mantiq yo'q (`FRONTEND.md` §3). */
export default function NewCashEntryPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/cashbook" className="text-sm text-link">
          ← Kassa
        </Link>
        <h1 className="m-0 text-2xl font-semibold">Kirim / chiqim</h1>
      </header>

      <CashEntryForm />
    </div>
  );
}
