'use client';

import type { TopProductsDto } from '@hisobai/contracts';
import { useRouter } from 'next/navigation';

import { Money } from '../../../components/money/money';
import { Card } from '../../../components/ui';
import { DataList } from '../../../components/ui/data-list';

/**
 * Mahsulot bo'yicha foyda (§13.7).
 *
 * Tartib **foyda bo'yicha** (serverda) — aylanma bo'yicha emas: §13.7
 * savolining o'zi "qancha foyda keltirdi". Ko'p sotilgan, lekin
 * foydasiz mahsulot ro'yxat tepasida turishi ega uchun chalg'ituvchi
 * bo'lardi.
 *
 * Miqdor **manfiy** bo'lishi mumkin: davr ichida sotilgandan ko'ra
 * ko'proq qaytarilgan bo'lsa. Uni yashirmaymiz — bu haqiqiy holat va
 * ega buni ko'rishi kerak.
 */
export function TopProductsTable({ report }: { report: TopProductsDto }) {
  const router = useRouter();

  if (report.products.length === 0) {
    return (
      <Card>
        <p className="m-0 text-sm text-text-tertiary">Bu davrda savdo bo‘lmagan.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="m-0 text-lg font-semibold">Mahsulot bo‘yicha foyda</h2>
      <DataList<TopProductsDto['products'][number]>
        label="Mahsulot bo‘yicha foyda"
        rows={report.products}
        rowKey={(product) => product.productId}
        onRowClick={(product) => {
          router.push(`/products/${product.productId}`);
        }}
        columns={[
          {
            header: 'Mahsulot',
            mobile: 'primary',
            cell: (product) => product.productName,
          },
          {
            header: 'Soni',
            mobile: 'secondary',
            numeric: true,
            className: 'w-28',
            cell: (product) => product.quantity,
          },
          {
            header: 'Aylanma',
            numeric: true,
            className: 'w-40',
            cell: (product) => (
              <Money amount={product.revenue} currency={report.currency} withCurrency={false} />
            ),
          },
          {
            header: 'Foyda',
            mobile: 'amount',
            numeric: true,
            className: 'w-40',
            cell: (product) => (
              <Money amount={product.profit} currency={report.currency} withCurrency={false} />
            ),
          },
        ]}
      />
    </div>
  );
}
