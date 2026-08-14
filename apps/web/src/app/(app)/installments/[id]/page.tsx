'use client';

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

  return <ContractCard contract={contract.data} />;
}
