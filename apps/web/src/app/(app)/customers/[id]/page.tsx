'use client';

import { formatPhone } from '@hisobai/contracts';
import { ArchiveRestore, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { Money } from '../../../../components/money/money';
import { ErrorState, TableSkeleton } from '../../../../components/states';
import { Badge, Button, Card } from '../../../../components/ui';
import { useCurrentUser } from '../../../../features/auth/queries';
import { CustomerForm } from '../../../../features/customers/components/customer-form';
import { FlagCard } from '../../../../features/customers/components/flag-card';
import { HistoryCard } from '../../../../features/customers/components/history-card';
import { useCustomer, useUpdateCustomer } from '../../../../features/customers/queries';
import { errorMessage } from '../../../../lib/messages';
import { can } from '../../../../lib/permissions';

/**
 * Mijoz kartasi (§6).
 *
 * **Qarz** (§6.11) valyuta bo'yicha alohida ko'rsatiladi — §1.3 bo'yicha
 * qarz savdo valyutasida qoladi, ya'ni bitta yig'indiga qo'shib bo'lmaydi.
 * Qarzi yo'q mijozda blok umuman chizilmaydi: server bo'sh massiv
 * qaytaradi va "0 so'm" bo'lmagan raqamni haqiqatdek ko'rsatardi
 * (`FRONTEND.md` §9).
 *
 * Savdo tarixi — `HistoryCard` (§25.1: `GET /customers/:id/history`).
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
          {data.isFlagged && <Badge tone="warning">Ehtiyot bo‘ling</Badge>}
          {!data.isActive && <Badge tone="muted">Arxivda</Badge>}
        </div>
      </header>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-6">
          <Detail label="Asosiy telefon" value={formatPhone(data.phonePrimary)} />
          <Detail label="Qo‘shimcha" value={formatPhone(data.phoneSecondary)} />
          <Detail label="Manzil" value={data.address ?? '—'} />
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
          {/*
            §6.11 — har valyuta alohida qator (§1.3: qarz savdo valyutasida
            qoladi). Bo'sh massiv bo'lsa hech narsa chizilmaydi: "0 so'm
            qarz" yozuvi mijozda qarz bor degan taassurot qoldirardi.

            Rang bilan ajratilmaydi (§20) — "Qarz" yorlig'ining o'zi ma'noni
            to'liq beradi, qarz esa xato emas, oddiy holat.
          */}
          {data.debt.map((row) => (
            <div key={row.currency}>
              <div className="text-sm text-text-secondary">Qarz ({row.currency})</div>
              <div className="tabular font-medium">
                <Money amount={row.amount} currency={row.currency} />
              </div>
            </div>
          ))}
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

      <HistoryCard customerId={data.id} />

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
