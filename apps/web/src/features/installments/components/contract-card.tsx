'use client';

import { ContractStatus, ScheduleStatus } from '@hisobai/contracts';
import type { InstallmentContractDto } from '@hisobai/contracts';
import Link from 'next/link';

import { Money } from '../../../components/money/money';
import { Badge, Card } from '../../../components/ui';
import { formatDate } from '../../../lib/format';
import { CONTRACT_STATUS_LABEL, CONTRACT_STATUS_TONE } from '../../../lib/labels';
import { ContractActions } from './contract-actions';
import { PaymentHistory } from './payment-history';

/**
 * Shartnoma kartasi (§9).
 *
 * Jadval — ekranning asosiy qismi: mijoz uchun "qaysi oyda qancha" degan
 * savolga javob beradigan yagona joy. Kechikkan qatorlar **belgilanadi,
 * lekin jarima yozilmaydi** (§9.9): kechikish faqat ogohlantirish.
 *
 * Qarz qoldig'i serverdan keladi va **hisoblanadi** (`outstanding`) —
 * ekranda qayta hisoblanmaydi, aks holda ikki manba paydo bo'lardi.
 */
export function ContractCard({ contract }: { contract: InstallmentContractDto }) {
  const overdueCount = contract.schedules.filter((schedule) => schedule.isOverdue).length;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">Shartnoma</span>
            <span className="tabular text-xl font-semibold">{contract.saleNumber ?? '—'}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={CONTRACT_STATUS_TONE[contract.status] ?? 'muted'}>
              {CONTRACT_STATUS_LABEL[contract.status] ?? contract.status}
            </Badge>
            {/* §9.9 — jarima yo'q, faqat ogohlantirish */}
            {overdueCount > 0 && <Badge tone="danger">{overdueCount} ta to‘lov kechikkan</Badge>}
          </div>
        </div>

        <dl className="m-0 grid gap-2 text-sm sm:grid-cols-2">
          <Row
            label="Mijoz"
            value={contract.customerName ?? '—'}
            href={contract.customerId ? `/customers/${contract.customerId}` : undefined}
          />
          <Row
            label="Savdo"
            value={contract.saleNumber ?? '—'}
            href={`/sales/${contract.saleId}`}
          />
          {/* §17.3 — naqd narx ustamasiz; ustama alohida daromad satri (§9.4) */}
          <Amount label="Naqd narx" amount={contract.cashPrice} currency={contract.currency} />
          <Amount
            label={
              contract.markupPercent === null ? 'Ustama' : `Ustama (${contract.markupPercent}%)`
            }
            amount={contract.markupAmount}
            currency={contract.currency}
          />
          <Amount
            label="Boshlang‘ich to‘lov"
            amount={contract.downPayment}
            currency={contract.currency}
          />
          <Amount label="Qarz (jami)" amount={contract.principal} currency={contract.currency} />
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default pt-3">
          <div>
            <div className="text-sm text-text-secondary">Qolgan qarz</div>
            <div className="text-2xl font-semibold">
              <Money amount={contract.outstanding} currency={contract.currency} />
            </div>
          </div>
          {contract.closedAt && (
            <div className="text-right text-sm text-text-secondary">
              Yopilgan: {formatDate(contract.closedAt)}
            </div>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-0">
        <h2 className="m-0 px-4 pt-4 text-lg font-semibold">To‘lov jadvali</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-default text-left text-text-secondary">
                <th className="p-3 font-medium">№</th>
                <th className="p-3 font-medium">Muddat</th>
                <th className="p-3 font-medium">Summa</th>
                <th className="p-3 font-medium">To‘langan</th>
                <th className="p-3 font-medium">Holat</th>
              </tr>
            </thead>
            <tbody>
              {contract.schedules.map((schedule) => (
                <tr key={schedule.id} className="border-b border-border-default last:border-0">
                  <td className="tabular p-3">{schedule.sequence}</td>
                  <td className="tabular p-3">
                    {formatDate(schedule.dueDate)}
                    {/* §9.8 — kechikish saqlanmaydi, sanadan hisoblanadi */}
                    {schedule.isOverdue && <span className="ml-2 text-danger">kechikkan</span>}
                  </td>
                  <td className="tabular p-3">
                    <Money
                      amount={schedule.amountDue}
                      currency={contract.currency}
                      withCurrency={false}
                    />
                  </td>
                  <td className="tabular p-3 text-text-secondary">
                    <Money
                      amount={schedule.amountPaid}
                      currency={contract.currency}
                      withCurrency={false}
                    />
                  </td>
                  <td className="p-3">
                    <Badge tone={SCHEDULE_TONE[schedule.status]}>
                      {SCHEDULE_LABEL[schedule.status]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {contract.status === ContractStatus.ACTIVE && <ContractActions contract={contract} />}

      <PaymentHistory contractId={contract.id} />
    </div>
  );
}

/** §9.8 — "muddati o'tgan" holat sifatida yo'q; u alohida belgi. */
const SCHEDULE_LABEL: Record<ScheduleStatus, string> = {
  [ScheduleStatus.UNPAID]: 'To‘lanmagan',
  [ScheduleStatus.PARTIAL]: 'Qisman',
  [ScheduleStatus.PAID]: 'To‘langan',
};

const SCHEDULE_TONE: Record<ScheduleStatus, 'muted' | 'warning' | 'success'> = {
  [ScheduleStatus.UNPAID]: 'muted',
  [ScheduleStatus.PARTIAL]: 'warning',
  [ScheduleStatus.PAID]: 'success',
};

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

function Amount({
  label,
  amount,
  currency,
}: {
  label: string;
  amount: string;
  currency: InstallmentContractDto['currency'];
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="m-0 font-medium">
        <Money amount={amount} currency={currency} />
      </dd>
    </div>
  );
}
