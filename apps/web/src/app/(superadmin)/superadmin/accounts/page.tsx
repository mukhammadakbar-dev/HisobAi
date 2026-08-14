'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';

import { Card } from '../../../../components/ui';
import { ErrorState, TableSkeleton } from '../../../../components/states';
import { ShopAdminTable } from '../../../../features/platform/components/shop-admin-table';
import { useShopAdmins } from '../../../../features/platform/queries';

/** §25.3 — SHOP_ADMIN hisoblari ro'yxati. */
export default function AccountsPage() {
  const admins = useShopAdmins();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-2xl font-semibold">Hisoblar</h1>

        <Link
          href="/superadmin/accounts/create"
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-action px-4 text-sm font-semibold text-action-text"
        >
          <Plus size={16} aria-hidden="true" />
          Yangi hisob
        </Link>
      </header>

      <Card>
        {admins.isPending && <TableSkeleton rows={5} />}

        {admins.isError && (
          <ErrorState
            error={admins.error}
            onRetry={() => {
              void admins.refetch();
            }}
          />
        )}

        {admins.isSuccess && <ShopAdminTable admins={admins.data.data} />}
      </Card>

      {/* Boshqa ro'yxatlar bilan bir xil naqsh (`customers/page.tsx`):
          sahifa kesilgani jimgina qolmaydi. */}
      {admins.data?.hasMore === true && (
        <p className="m-0 text-sm text-text-tertiary">
          Birinchi {admins.data.data.length} ta hisob ko‘rsatildi.
        </p>
      )}
    </div>
  );
}
