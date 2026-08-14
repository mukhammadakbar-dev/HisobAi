'use client';

import type { TopProductsDto } from '@hisobai/contracts';
import Link from 'next/link';

import { Money } from '../../../components/money/money';
import { Card } from '../../../components/ui';

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
  if (report.products.length === 0) {
    return (
      <Card>
        <p className="m-0 text-sm text-text-tertiary">Bu davrda savdo bo‘lmagan.</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-0">
      <h2 className="m-0 px-4 pt-4 text-lg font-semibold">Mahsulot bo‘yicha foyda</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-default text-left text-text-secondary">
              <th className="p-3 font-medium">Mahsulot</th>
              <th className="p-3 font-medium">Soni</th>
              <th className="p-3 font-medium">Aylanma</th>
              <th className="p-3 font-medium">Foyda</th>
            </tr>
          </thead>
          <tbody>
            {report.products.map((product) => (
              <tr key={product.productId} className="border-b border-border-default last:border-0">
                <td className="p-3">
                  <Link href={`/products/${product.productId}`} className="text-link">
                    {product.productName}
                  </Link>
                </td>
                <td className="tabular p-3">{product.quantity}</td>
                <td className="tabular p-3">
                  <Money amount={product.revenue} currency={report.currency} withCurrency={false} />
                </td>
                <td className="tabular p-3 font-medium">
                  <Money amount={product.profit} currency={report.currency} withCurrency={false} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
