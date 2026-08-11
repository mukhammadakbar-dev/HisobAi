'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { TableSkeleton } from '../../../../components/states';
import { Card } from '../../../../components/ui';
import { ReceiveForm } from '../../../../features/inventory/components/receive-form';

/**
 * Qabul qilish (§5.11).
 *
 * `useSearchParams` `Suspense` ichida bo'lishi shart — u so'rov
 * parametrlariga bog'liq va Next uni statik render paytida to'xtatib
 * turadi. Chegarasiz butun sahifa client-render'ga tushardi.
 */
export default function ReceivePage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/inventory"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-link hover:underline"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Ombor
        </Link>
        <h1 className="m-0 text-2xl font-semibold">Qabul qilish</h1>
        <p className="m-0 text-text-secondary">
          Hammasi bitta yozuvda saqlanadi: birlik, harakat va oxirgi tannarx.
        </p>
      </header>

      <Suspense
        fallback={
          <Card>
            <TableSkeleton rows={4} />
          </Card>
        }
      >
        <ReceiveFormWithProduct />
      </Suspense>
    </div>
  );
}

function ReceiveFormWithProduct() {
  const params = useSearchParams();
  return <ReceiveForm initialProductId={params.get('productId') ?? undefined} />;
}
