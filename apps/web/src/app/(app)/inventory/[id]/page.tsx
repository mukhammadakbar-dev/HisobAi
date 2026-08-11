'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { Money } from '../../../../components/money/money';
import { ErrorState, TableSkeleton } from '../../../../components/states';
import { Badge, Card } from '../../../../components/ui';
import { useCurrentUser } from '../../../../features/auth/queries';
import { useInventoryItem } from '../../../../features/inventory/queries';
import { formatDateTime } from '../../../../lib/format';
import {
  ADJUST_REASON_LABEL,
  INVENTORY_STATUS_LABEL,
  INVENTORY_STATUS_TONE,
  MOVEMENT_TYPE_LABEL,
} from '../../../../lib/labels';
import { can } from '../../../../lib/permissions';

/**
 * Ombor birligi va uning tarixi (§5.10).
 *
 * Harakatlar hech qachon o'chirilmaydi — shuning uchun bu ro'yxat
 * "nima bo'lgan" degan savolga yagona to'liq javob. Hozircha unda
 * faqat `QABUL` bo'ladi; savdo va qaytarish o'z bosqichida qo'shiladi.
 */
export default function InventoryItemPage() {
  const params = useParams<{ id: string }>();
  const item = useInventoryItem(params.id);
  const user = useCurrentUser();

  if (item.isPending) {
    return (
      <Card>
        <TableSkeleton rows={5} />
      </Card>
    );
  }

  if (item.isError) {
    return (
      <ErrorState
        error={item.error}
        onRetry={() => {
          void item.refetch();
        }}
      />
    );
  }

  const data = item.data;

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

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 text-2xl font-semibold">{data.product.displayName}</h1>
          <Badge tone={INVENTORY_STATUS_TONE[data.status] ?? 'muted'}>
            {INVENTORY_STATUS_LABEL[data.status]}
          </Badge>
        </div>
      </header>

      <Card className="flex flex-wrap gap-6">
        <Detail label="IMEI-1" value={data.imei1} />
        <Detail label="IMEI-2" value={data.imei2} />
        <Detail label="Seriya raqami" value={data.serialNumber} />
        {can(user.data, 'cost.view') && (
          <div>
            <div className="text-sm text-text-secondary">Tannarx</div>
            <div className="font-medium">
              <Money amount={data.costPrice} currency={data.costCurrency} />
            </div>
          </div>
        )}
        <Detail label="Qabul qilingan" value={formatDateTime(data.receivedAt)} />
        {/* §16.4 — holat `MAVJUD` ga qaytsa ham sabab saqlanib qoladi */}
        {data.returnReason && <Detail label="Qaytarish sababi" value={data.returnReason} />}
        {data.note && <Detail label="Izoh" value={data.note} />}
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-lg font-semibold">Tarix</h2>

        <Card className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-default text-left text-text-secondary">
                <th className="p-3 font-medium">Amal</th>
                <th className="p-3 text-right font-medium">Miqdor</th>
                <th className="p-3 font-medium">Sabab</th>
                <th className="p-3 font-medium">Vaqt</th>
              </tr>
            </thead>
            <tbody>
              {data.movements.map((movement) => (
                <tr key={movement.id} className="border-b border-border-default last:border-0">
                  <td className="p-3 font-medium">{MOVEMENT_TYPE_LABEL[movement.type]}</td>
                  <td className="tabular p-3 text-right">{movement.quantity}</td>
                  <td className="p-3 text-text-secondary">
                    {movement.reason ? ADJUST_REASON_LABEL[movement.reason] : '—'}
                  </td>
                  <td className="p-3 text-text-secondary">{formatDateTime(movement.occurredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-sm text-text-secondary">{label}</div>
      <div className="tabular font-medium">{value ?? '—'}</div>
    </div>
  );
}
