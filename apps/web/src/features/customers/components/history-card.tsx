'use client';

import type { CustomerHistoryItemDto } from '@hisobai/contracts';
import Link from 'next/link';

import { Money } from '../../../components/money/money';
import { EmptyState, ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Card } from '../../../components/ui';
import { formatDateTime } from '../../../lib/format';
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  REVERSAL_KIND_LABEL,
  SALE_STATUS_LABEL,
  SALE_STATUS_TONE,
} from '../../../lib/labels';
import { useCustomerHistory } from '../queries';

/**
 * Mijoz tarixi (§6, `DECISIONS.md` §25.1–§25.4).
 *
 * Savdo va nasiya to'lovlari **bitta xronologik oqimda** keladi — server
 * ularni birlashtirib, `at` bo'yicha saralab beradi (§25.2). Bu yerda
 * qayta saralash YO'Q: tartib serverniki, aks holda sahifalashda ikki
 * xil tartib paydo bo'lardi.
 *
 * Naqd savdoning to'lovi alohida qator sifatida chiqmaydi (§25.4) —
 * unda to'lov savdoning o'zi, ikki marta ko'rsatish bitta voqeani ikki
 * marta sanardi. Qaytarish va bekor qilish esa CHIQADI (§25.3): ular
 * savdodan keyingi alohida hodisa va aynan ularning SANASI asl qatorda
 * ko'rinmaydi — "yanvarda oldi, martda qaytardi" naqshi §6.9 uchun kerak.
 */
export function HistoryCard({ customerId }: { customerId: string }) {
  const history = useCustomerHistory(customerId);

  if (history.isPending) {
    return (
      <Card>
        <h2 className="m-0 mb-3 text-lg font-semibold">Tarix</h2>
        <TableSkeleton rows={3} />
      </Card>
    );
  }

  if (history.isError) {
    return (
      <Card>
        <h2 className="m-0 mb-3 text-lg font-semibold">Tarix</h2>
        <ErrorState error={history.error} onRetry={() => void history.refetch()} />
      </Card>
    );
  }

  const items = history.data.data;

  return (
    <Card>
      <h2 className="m-0 mb-3 text-lg font-semibold">Tarix</h2>

      {items.length === 0 ? (
        /* Amal taklif qilinmaydi: "Yangi savdo" ga o'tish mijozni oldindan
           tanlamaydi, ya'ni tugma va'da qilgan narsani bajarmasdi. */
        <EmptyState title="Bu mijozda hali savdo yo‘q" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Mijozning savdolari va nasiya to‘lovlari, eng yangisidan boshlab
            </caption>
            <thead>
              <tr className="border-b border-border-default text-left text-text-secondary">
                <th scope="col" className="p-3 font-medium">
                  Sana
                </th>
                <th scope="col" className="p-3 font-medium">
                  Hodisa
                </th>
                <th scope="col" className="p-3 font-medium">
                  Holat
                </th>
                <th scope="col" className="p-3 font-medium">
                  Summa
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <HistoryRow key={`${item.kind}-${item.id}`} item={item} />
              ))}
            </tbody>
          </table>

          {history.data.hasMore && (
            <p className="m-0 mt-3 text-sm text-text-secondary">
              Birinchi {items.length} ta hodisa ko‘rsatildi.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function HistoryRow({ item }: { item: CustomerHistoryItemDto }) {
  const isSale = item.kind === 'SALE';

  /*
    Teskari yozuv qatori "Savdo 2026-00042-R1" deb ko'rinsa chalg'itadi —
    u yangi savdo emas. `status: REVERSAL` ning o'zi esa "Qaytarish" bilan
    "Bekor qilish" ni ajratmaydi, shuning uchun `reversalKind` ishlatiladi
    (`DECISIONS.md` §25.3). Summasi manfiy — ishorani server yozadi (§22.2).
  */
  const saleLabel =
    isSale && item.reversalKind
      ? (REVERSAL_KIND_LABEL[item.reversalKind] ?? 'Teskari yozuv')
      : 'Savdo';

  return (
    <tr className="border-b border-border-default last:border-0">
      <td className="tabular p-3 text-text-secondary">{formatDateTime(item.at)}</td>
      <td className="p-3">
        {isSale ? (
          <Link href={`/sales/${item.id}`} className="font-medium text-link hover:underline">
            {saleLabel} {item.number}
          </Link>
        ) : (
          <Link
            href={`/installments/${item.contractId}`}
            className="font-medium text-link hover:underline"
          >
            Nasiya to‘lovi
          </Link>
        )}
      </td>
      <td className="p-3">
        {/* Rang yagona signal emas (§20) — yorliq matni har doim bor */}
        {isSale ? (
          <Badge tone={SALE_STATUS_TONE[item.status] ?? 'muted'}>
            {SALE_STATUS_LABEL[item.status] ?? item.status}
          </Badge>
        ) : (
          <Badge tone={PAYMENT_STATUS_TONE[item.status] ?? 'muted'}>
            {PAYMENT_STATUS_LABEL[item.status] ?? item.status}
          </Badge>
        )}
      </td>
      <td className="tabular p-3 font-medium">
        <Money amount={isSale ? item.total : item.amount} currency={item.currency} />
      </td>
    </tr>
  );
}
