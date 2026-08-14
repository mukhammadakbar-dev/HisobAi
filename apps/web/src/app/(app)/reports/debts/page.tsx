'use client';

import Link from 'next/link';

import { Money } from '../../../../components/money/money';
import { EmptyState, ErrorState, TableSkeleton } from '../../../../components/states';
import { Card } from '../../../../components/ui';
import { formatDate } from '../../../../lib/format';
import { useDebtors } from '../../../../features/reports/queries';

/**
 * Qarzdorlar (§13.8).
 *
 * Tartib serverdan keladi: **muddati o'tganlar tepada**. Ekran uni
 * qayta saralamaydi — ro'yxatning maqsadi "kimga qo'ng'iroq qilish
 * kerak" degan savolga javob berish va tartibni o'zgartirish o'sha
 * javobni yashirardi.
 *
 * §9.9 — **jarima yo'q**: kechikish faqat ogohlantirish sifatida
 * ko'rsatiladi.
 */
export default function DebtorsPage() {
  const report = useDebtors();

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-semibold">Qarzdorlar</h1>
          <p className="m-0 text-sm text-text-secondary">
            Muddati o‘tganlar tepada. Jarima yo‘q — kechikish ogohlantirish (§9.9).
          </p>
        </div>
        <Link href="/reports" className="text-sm text-link">
          ← Hisobotlar
        </Link>
      </header>

      {report.isSuccess && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">Jami qarz</span>
            <span className="text-2xl font-semibold">
              <Money amount={report.data.totalOutstanding} currency={report.data.currency} />
            </span>
          </Card>
          <Card className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">Muddati o‘tgan shartnomalar</span>
            <span
              className={`text-2xl font-semibold ${report.data.overdueCount > 0 ? 'text-danger' : ''}`}
            >
              {report.data.overdueCount}
            </span>
          </Card>
        </div>
      )}

      <Card className="p-0">
        {report.isPending && (
          <div className="p-4">
            <TableSkeleton rows={5} />
          </div>
        )}

        {report.isError && (
          <div className="p-4">
            <ErrorState
              error={report.error}
              onRetry={() => {
                void report.refetch();
              }}
            />
          </div>
        )}

        {report.isSuccess && report.data.debtors.length === 0 && (
          <div className="p-4">
            <EmptyState title="Qarzdor yo‘q — barcha shartnomalar yopilgan" />
          </div>
        )}

        {report.isSuccess && report.data.debtors.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-default text-left text-text-secondary">
                  <th className="p-3 font-medium">Mijoz</th>
                  <th className="p-3 font-medium">Savdo</th>
                  <th className="p-3 font-medium">Qarz</th>
                  <th className="p-3 font-medium">Muddat</th>
                  <th className="p-3 font-medium">Kechikish</th>
                </tr>
              </thead>
              <tbody>
                {report.data.debtors.map((debtor) => (
                  <tr
                    key={debtor.contractId}
                    className="border-b border-border-default last:border-0"
                  >
                    <td className="p-3">
                      <Link href={`/installments/${debtor.contractId}`} className="text-link">
                        {debtor.customerName ?? '—'}
                      </Link>
                    </td>
                    <td className="tabular p-3 text-text-secondary">{debtor.saleNumber ?? '—'}</td>
                    <td className="tabular p-3 font-medium">
                      <Money
                        amount={debtor.outstanding}
                        currency={debtor.currency}
                        withCurrency={false}
                      />
                    </td>
                    <td className="tabular p-3">
                      {debtor.nextDueDate === null ? '—' : formatDate(debtor.nextDueDate)}
                    </td>
                    <td className="tabular p-3">
                      {debtor.daysOverdue === 0 ? (
                        <span className="text-text-tertiary">—</span>
                      ) : (
                        <span className="text-danger">{debtor.daysOverdue} kun</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
