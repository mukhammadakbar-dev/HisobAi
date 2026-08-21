'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Money } from '../../../../components/money/money';
import { EmptyState, ErrorState, TableSkeleton } from '../../../../components/states';
import { Badge, Card } from '../../../../components/ui';
import { DataList } from '../../../../components/ui/data-list';
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
  const router = useRouter();
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

      </Card>

      {report.isSuccess && report.data.debtors.length > 0 && (
        <DataList
          label="Qarzdorlar ro‘yxati"
          rows={report.data.debtors}
          rowKey={(debtor) => debtor.contractId}
          onRowClick={(debtor) => {
            router.push(`/installments/${debtor.contractId}`);
          }}
          accent={(debtor) => (debtor.daysOverdue === 0 ? undefined : 'danger')}
          columns={[
            {
              header: 'Mijoz',
              mobile: 'primary',
              cell: (debtor) => debtor.customerName ?? '—',
            },
            {
              header: 'Savdo',
              mobile: 'secondary',
              className: 'w-32',
              cell: (debtor) => debtor.saleNumber ?? '—',
            },
            {
              header: 'Qarz',
              mobile: 'amount',
              numeric: true,
              className: 'w-40',
              cell: (debtor) => (
                <Money
                  amount={debtor.outstanding}
                  currency={debtor.currency}
                  withCurrency={false}
                />
              ),
            },
            {
              header: 'Muddat',
              className: 'w-36',
              cell: (debtor) => (
                <span className="tabular">
                  {debtor.nextDueDate === null ? '—' : formatDate(debtor.nextDueDate)}
                </span>
              ),
            },
            {
              header: 'Kechikish',
              mobile: 'status',
              className: 'w-32',
              cell: (debtor) =>
                debtor.daysOverdue === 0 ? (
                  <span className="text-text-tertiary">—</span>
                ) : (
                  <Badge tone="danger">{debtor.daysOverdue} kun</Badge>
                ),
            },
          ]}
        />
      )}
    </div>
  );
}
