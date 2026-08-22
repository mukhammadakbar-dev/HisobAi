'use client';

import { BASE_CURRENCY, formatPhone } from '@hisobai/contracts';
import { ArchiveRestore, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { Money } from '../../../../components/money/money';
import { ErrorState, TableSkeleton } from '../../../../components/states';
import { Badge, Button, Card } from '../../../../components/ui';
import { useCurrentUser } from '../../../../features/auth/queries';
import { CustomerForm } from '../../../../features/customers/components/customer-form';
import { FlagCard } from '../../../../features/customers/components/flag-card';
import { useCustomer, useUpdateCustomer } from '../../../../features/customers/queries';
import { CUSTOMER_DEBT_STATUS_LABEL, CUSTOMER_DEBT_STATUS_TONE } from '../../../../lib/labels';
import { errorMessage } from '../../../../lib/messages';
import { can } from '../../../../lib/permissions';

/**
 * Mijoz kartasi (§6).
 *
 * Qarz — `CustomerDto.outstandingDebt`/`debtStatus` (§6.12, §9.8
 * kengaytma): faol nasiya shartnomalaridan so'rov paytida hisoblanadi.
 * Savdo tarixining o'zi bu yerda hali yo'q — u alohida bosqich.
 */
export default function CustomerPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const customer = useCustomer(id);
  const update = useUpdateCustomer(id);
  const user = useCurrentUser();

  if (customer.isPending) {
    return (
      <Card>
        <TableSkeleton rows={5} />
      </Card>
    );
  }

  if (customer.isError) {
    return (
      <ErrorState
        error={customer.error}
        onRetry={() => {
          void customer.refetch();
        }}
      />
    );
  }

  const data = customer.data;

  const toggleArchive = (): void => {
    update.mutate({ isActive: !data.isActive, expectedUpdatedAt: data.updatedAt });
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/customers"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-link hover:underline"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Mijozlar
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 text-2xl font-semibold">{data.fullName}</h1>
          <Badge tone={CUSTOMER_DEBT_STATUS_TONE[data.debtStatus] ?? 'muted'}>
            {CUSTOMER_DEBT_STATUS_LABEL[data.debtStatus] ?? data.debtStatus}
          </Badge>
          {data.isFlagged && <Badge tone="warning">Ehtiyot bo‘ling</Badge>}
          {!data.isActive && <Badge tone="muted">Arxivda</Badge>}
        </div>
      </header>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-6">
          <Detail label="Asosiy telefon" value={formatPhone(data.phonePrimary)} />
          <Detail label="Qo‘shimcha" value={formatPhone(data.phoneSecondary)} />
          <Detail label="Manzil" value={data.address ?? '—'} />
          <div>
            <div className="text-sm text-text-secondary">Joriy qarz</div>
            <div
              className={`tabular font-medium ${data.debtStatus === 'OVERDUE' ? 'text-danger' : ''}`}
            >
              <Money amount={data.outstandingDebt} currency={BASE_CURRENCY} />
            </div>
          </div>
          {can(user.data, 'passport.view') && (
            <Detail
              label="Passport"
              value={
                data.passportSeries && data.passportNumber
                  ? `${data.passportSeries} ${data.passportNumber}`
                  : '—'
              }
            />
          )}
        </div>

        {can(user.data, 'customer.archive') && (
          <Button type="button" onClick={toggleArchive} disabled={update.isPending}>
            <ArchiveRestore size={16} aria-hidden="true" className="mr-2" />
            {data.isActive ? 'Arxivlash' : 'Tiklash'}
          </Button>
        )}
      </Card>

      {update.isError && (
        <p className="m-0 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
          {errorMessage(update.error)}
        </p>
      )}

      {can(user.data, 'customer.archive') && <FlagCard customer={data} />}

      {/* `key` — server javobidan keyin forma yangi qulf tokeni bilan qayta quriladi */}
      <CustomerForm key={data.updatedAt} customer={data} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-text-secondary">{label}</div>
      <div className="tabular font-medium">{value}</div>
    </div>
  );
}
