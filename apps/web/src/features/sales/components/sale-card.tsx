'use client';

import { SaleStatus, multiplyMoney } from '@hisobai/contracts';
import type { SaleDto } from '@hisobai/contracts';
import Link from 'next/link';

import { Money } from '../../../components/money/money';
import { Badge, Card } from '../../../components/ui';
import { formatDateTime } from '../../../lib/format';
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  SALE_KIND_LABEL,
  SALE_STATUS_LABEL,
  SALE_STATUS_TONE,
} from '../../../lib/labels';

/**
 * Tasdiqlangan savdo kartasi (§7).
 *
 * Ekran **faqat o'qish uchun**: tasdiqlangan savdo o'zgartirilmaydi va
 * o'chirilmaydi, faqat teskari yozuv bilan tuzatiladi (§21, §17.4).
 * "Qaytarish" va "Bekor qilish" tugmalari shu yerda paydo bo'ladi —
 * 6-bosqichda (`TZ.md` §22), qaytarish moduli bilan birga. Hozir ular
 * qo'yilmadi: bosilganda hech narsa qilmaydigan tugma "ishlamayapti"
 * degan xabar bilan qaytadi.
 */
export function SaleCard({ sale }: { sale: SaleDto }) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">Savdo raqami (§7.6)</span>
            <span className="tabular text-xl font-semibold">{sale.number ?? '—'}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={SALE_STATUS_TONE[sale.status] ?? 'muted'}>
              {SALE_STATUS_LABEL[sale.status] ?? sale.status}
            </Badge>
            <Badge tone="info">{SALE_KIND_LABEL[sale.kind] ?? sale.kind}</Badge>
          </div>
        </div>

        <dl className="m-0 grid gap-2 text-sm sm:grid-cols-2">
          <Row label="Sana" value={formatDateTime(sale.soldAt)} />
          <Row label="Tasdiqlangan" value={formatDateTime(sale.confirmedAt)} />
          <Row
            label="Mijoz"
            value={sale.customerName ?? 'Tanlanmagan'}
            href={sale.customerId ? `/customers/${sale.customerId}` : undefined}
          />
          {/* §1.7 — savdo kursi snapshot; qaytarishda ham aynan shu ishlatiladi */}
          <Row label="Kurs" value={sale.exchangeRate ?? '—'} />
          {sale.note && <Row label="Izoh" value={sale.note} />}
        </dl>
      </Card>

      <Card className="flex flex-col gap-3 p-0">
        <h2 className="m-0 px-4 pt-4 text-lg font-semibold">Qatorlar</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-default text-left text-text-secondary">
                <th className="p-3 font-medium">Mahsulot</th>
                <th className="p-3 font-medium">Miqdor</th>
                <th className="p-3 font-medium">Narx</th>
                {/* §7.11 — tannarx snapshot; `SELLER` da `null` (P7) */}
                <th className="p-3 font-medium">Tannarx</th>
                <th className="p-3 font-medium">Jami</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => (
                <tr key={item.id} className="border-b border-border-default last:border-0">
                  <td className="p-3">
                    <Link href={`/products/${item.productId}`} className="text-link">
                      {item.productName}
                    </Link>
                    {item.returnedQuantity > 0 && (
                      <div className="text-text-tertiary">
                        Qaytarilgan: {item.returnedQuantity} dona
                      </div>
                    )}
                  </td>
                  <td className="tabular p-3">{item.quantity}</td>
                  <td className="tabular p-3">
                    <Money amount={item.unitPrice} currency={sale.currency} withCurrency={false} />
                  </td>
                  <td className="tabular p-3 text-text-secondary">
                    {item.costSnapshot === null || item.costCurrency === null ? (
                      '—'
                    ) : (
                      <Money amount={item.costSnapshot} currency={item.costCurrency} />
                    )}
                  </td>
                  <td className="tabular p-3">
                    <Money
                      amount={multiplyMoney(item.unitPrice, item.quantity, sale.currency)}
                      currency={sale.currency}
                      withCurrency={false}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border-default p-4">
          <div>
            <div className="text-sm text-text-secondary">Savdo summasi</div>
            <div className="text-2xl font-semibold">
              <Money amount={sale.total} currency={sale.currency} />
            </div>
          </div>
          {/* §7.9 — savat foydasi; `SELLER` uchun `null` (P7) */}
          {sale.profit !== null && (
            <div className="text-right">
              <div className="text-sm text-text-secondary">Foyda</div>
              <div className="text-lg font-semibold">
                <Money amount={sale.profit} currency={sale.currency} />
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-lg font-semibold">To‘lovlar</h2>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {sale.payments.map((payment) => (
            <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">
                  {PAYMENT_METHOD_LABEL[payment.method] ?? payment.method}
                </span>
                <Badge tone={PAYMENT_STATUS_TONE[payment.status] ?? 'muted'}>
                  {PAYMENT_STATUS_LABEL[payment.status] ?? payment.status}
                </Badge>
                {payment.cashAccountName && (
                  <span className="text-text-secondary">{payment.cashAccountName}</span>
                )}
              </span>
              <span className="flex items-center gap-2 text-sm">
                <Money amount={payment.paidAmount} currency={payment.paidCurrency} />
                {/* §10 — berilgan summa va savdodan ayrilgani alohida saqlanadi */}
                {payment.paidCurrency !== payment.appliedCurrency && (
                  <span className="text-text-secondary">
                    (
                    <Money amount={payment.appliedAmount} currency={payment.appliedCurrency} />)
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>

        {sale.status === SaleStatus.CONFIRMED && sale.payments.length === 0 && (
          <p className="m-0 text-sm text-text-tertiary">To‘lov yozuvi yo‘q.</p>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="m-0 font-medium">
        {href ? (
          <Link href={href} className="text-link">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
