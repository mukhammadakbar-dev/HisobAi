'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { Badge, Card } from '../../../../../components/ui';
import { ErrorState, TableSkeleton } from '../../../../../components/states';
import { AccountStatusCard } from '../../../../../features/platform/components/account-status-card';
import { useShopAdmin } from '../../../../../features/platform/queries';
import { formatDateTime } from '../../../../../lib/format';
import { ACCOUNT_STATUS_LABEL, ACCOUNT_STATUS_TONE } from '../../../../../lib/labels';

/**
 * SHOP_ADMIN hisob kartasi (§25.3).
 *
 * Kartada **do'kon biznes ma'lumoti yo'q** va bo'lmaydi ham: savdo
 * hajmi, mijozlar soni, kassa qoldig'i — hammasi §25.3 chegarasining
 * narigi tomonida. Bu yerda faqat platforma metadata'si: kim, qachon,
 * qanday holatda va do'kon tuzganmi.
 */
export default function AccountPage() {
  const params = useParams<{ id: string }>();
  const admin = useShopAdmin(params.id);

  if (admin.isPending) {
    return (
      <Card>
        <TableSkeleton rows={4} />
      </Card>
    );
  }

  if (admin.isError) {
    return (
      <ErrorState
        error={admin.error}
        onRetry={() => {
          void admin.refetch();
        }}
      />
    );
  }

  const data = admin.data;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/superadmin/accounts"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-link hover:underline"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Hisoblar
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 text-2xl font-semibold">{data.displayName}</h1>
          <Badge tone={ACCOUNT_STATUS_TONE[data.status] ?? 'muted'}>
            {ACCOUNT_STATUS_LABEL[data.status] ?? data.status}
          </Badge>
        </div>
      </header>

      <Card className="flex flex-wrap gap-6">
        <Detail label="Email" value={data.email} />
        <Detail label="Yaratilgan" value={formatDateTime(data.createdAt)} />
        <Detail
          label="Do‘kon"
          value={data.shopId === null ? 'Hali tuzilmagan' : 'Tuzilgan'}
          hint={
            data.shopId === null
              ? 'Egasi kirgach o‘zi tuzadi (§25.6) — bu kutilgan holat.'
              : undefined
          }
        />
      </Card>

      <AccountStatusCard admin={data} />
    </div>
  );
}

function Detail({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-sm text-text-secondary">{label}</div>
      <div className="font-medium">{value}</div>
      {hint && <div className="mt-0.5 max-w-xs text-sm text-text-secondary">{hint}</div>}
    </div>
  );
}
