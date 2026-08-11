'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { CustomerForm } from '../../../../features/customers/components/customer-form';

export default function NewCustomerPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/customers"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-link hover:underline"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Mijozlar
        </Link>
        <h1 className="m-0 text-2xl font-semibold">Yangi mijoz</h1>
        <p className="m-0 text-text-secondary">
          Naqd savdoda mijoz ixtiyoriy, nasiyada majburiy (§6.1).
        </p>
      </header>

      <CustomerForm />
    </div>
  );
}
