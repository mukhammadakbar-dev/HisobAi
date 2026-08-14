'use client';

import Link from 'next/link';
import { use } from 'react';

import { ErrorState, TableSkeleton } from '../../../../components/states';
import { Card } from '../../../../components/ui';
import { ContractCard } from '../../../../features/installments/components/contract-card';
import { useInstallment } from '../../../../features/installments/queries';

/** Shartnoma kartasi (§9) — jadval, amallar va to'lovlar tarixi. */
export default function InstallmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const contract = useInstallment(id);

  if (contract.isPending) {
    return (
      <Card>
        <TableSkeleton rows={6} />
      </Card>
    );
  }

  if (contract.isError) {
    return (
      <Card>
        <ErrorState
          error={contract.error}
          onRetry={() => {
            void contract.refetch();
          }}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Sahifada bitta `h1` — savdo kartasidagi bilan bir xil naqsh
          (`sales/[id]/page.tsx`). Karta ichidagilar `h2`, ya'ni sarlavha
          ierarxiyasi uzilmaydi va ekran o'quvchi sahifa nimadan iborat
          ekanini birinchi sarlavhadan biladi */}
      <header className="flex flex-col gap-1">
        <Link href="/installments" className="text-sm text-link">
          ← Nasiya
        </Link>
        <h1 className="m-0 text-2xl font-semibold">Shartnoma {contract.data.saleNumber ?? ''}</h1>
      </header>

      <ContractCard contract={contract.data} />
    </div>
  );
}
