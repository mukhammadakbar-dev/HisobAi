'use client';

import { AccountStatus } from '@hisobai/contracts';
import Link from 'next/link';

import { Card } from '../../../components/ui';
import { ErrorState, TableSkeleton } from '../../../components/states';
import { useShopAdmins } from '../../../features/platform/queries';

/**
 * Platforma boshqaruvi (§25.4).
 *
 * **Bu yerda biznes ko'rsatkich yo'q** — aylanma, foyda, savdo soni
 * yo'q va bo'lmaydi (§25.3). Ko'rsatilgan to'rt raqam — sof platforma
 * metadata'si va ular hisoblar ro'yxatidan hosil qilinadi, alohida
 * so'rovsiz: SUPERADMIN'ning yagona ishi hisoblarni boshqarish, ya'ni
 * "nechta hamkor bor va nechtasi hali ishga tushmagan" degan savol
 * uning uchun haqiqiy savol.
 *
 * `/superadmin/dashboard` alohida manzil sifatida **qilinmadi**
 * (`TZ.md` §25.4 uni sanaydi): u shu sahifaning aynan nusxasi bo'lardi.
 * Panelning ildizi o'zi boshqaruv ekrani.
 */
export default function SuperadminHomePage() {
  const admins = useShopAdmins();

  if (admins.isPending) {
    return (
      <Card>
        <TableSkeleton rows={3} />
      </Card>
    );
  }

  if (admins.isError) {
    return (
      <ErrorState
        error={admins.error}
        onRetry={() => {
          void admins.refetch();
        }}
      />
    );
  }

  const rows = admins.data.data;
  const active = rows.filter((row) => row.status === AccountStatus.ACTIVE).length;
  const blocked = rows.filter((row) => row.status !== AccountStatus.ACTIVE).length;
  const withoutShop = rows.filter((row) => row.shopId === null).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-semibold">Boshqaruv</h1>
        <p className="m-0 text-sm text-text-secondary">Platforma hisoblari holati.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Jami hisob" value={rows.length} />
        <Stat label="Faol" value={active} />
        <Stat label="To‘xtatilgan" value={blocked} />
        <Stat label="Do‘kon tuzmagan" value={withoutShop} />
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-sm text-text-secondary">
          Hisoblarni ko‘rish, yaratish va holatini o‘zgartirish.
        </p>
        <Link
          href="/superadmin/accounts"
          className="inline-flex min-h-11 items-center rounded-md bg-action px-4 text-sm font-semibold text-action-text"
        >
          Hisoblarga o‘tish
        </Link>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="flex flex-col gap-1">
      <div className="text-sm text-text-secondary">{label}</div>
      <div className="tabular text-2xl font-semibold">{value}</div>
    </Card>
  );
}
