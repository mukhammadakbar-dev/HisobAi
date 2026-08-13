'use client';

import { SaleStatus } from '@hisobai/contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { ErrorState, TableSkeleton } from '../../../../components/states';
import { Card } from '../../../../components/ui';
import { SaleCard } from '../../../../features/sales/components/sale-card';
import { SaleForm } from '../../../../features/sales/components/sale-form';
import { useSale } from '../../../../features/sales/queries';

/**
 * Savdo kartasi (§7).
 *
 * Bitta marshrut, ikki ko'rinish — holat hal qiladi: qoralama
 * tahrirlanadi (§7.7), tasdiqlangani esa faqat o'qiladi (§21).
 * Ikkita alohida sahifa qilinmadi: ega tasdiqlagandan keyin aynan
 * shu manzilda qoladi va sahifa o'z-o'zidan o'qish rejimiga o'tadi.
 */
export default function SalePage() {
  const params = useParams<{ id: string }>();
  const sale = useSale(params.id);

  if (sale.isPending) {
    return (
      <Card>
        <TableSkeleton rows={6} />
      </Card>
    );
  }

  if (sale.isError) {
    return (
      <ErrorState
        error={sale.error}
        onRetry={() => {
          void sale.refetch();
        }}
      />
    );
  }

  const isDraft = sale.data.status === SaleStatus.DRAFT;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/sales" className="text-sm text-link">
          ← Savdolar
        </Link>
        <h1 className="m-0 text-2xl font-semibold">
          {isDraft ? 'Savdo qoralamasi' : `Savdo ${sale.data.number ?? ''}`}
        </h1>
      </header>

      {isDraft ? <SaleForm sale={sale.data} /> : <SaleCard sale={sale.data} />}
    </div>
  );
}
