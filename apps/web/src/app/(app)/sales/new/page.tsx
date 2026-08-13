'use client';

import Link from 'next/link';

import { SaleForm } from '../../../../features/sales/components/sale-form';

/**
 * Yangi savdo (`FRONTEND.md` §14 — 5-bosqichning eng murakkab ekrani).
 *
 * Sahifada mantiq yo'q: u faqat `features/sales` dagi formani chaqiradi
 * (`FRONTEND.md` §3 qoidasi — marshrut o'zgarganda mantiq ko'chmasin).
 */
export default function NewSalePage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/sales" className="text-sm text-link">
          ← Savdolar
        </Link>
        <h1 className="m-0 text-2xl font-semibold">Yangi savdo</h1>
        <p className="m-0 text-text-secondary">
          Qoralama omborni band qilmaydi — birinchi tasdiqlagan oladi (§5.5).
        </p>
      </header>

      <SaleForm />
    </div>
  );
}
