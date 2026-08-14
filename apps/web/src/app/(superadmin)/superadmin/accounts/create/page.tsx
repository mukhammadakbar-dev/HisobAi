'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { Card } from '../../../../../components/ui';
import { CreateShopAdminForm } from '../../../../../features/platform/components/create-shop-admin-form';

/** §25.5 — SUPERADMIN hisob yaratadi; Shop'ni egasi o'zi tuzadi. */
export default function CreateAccountPage() {
  return (
    <div className="flex max-w-md flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/superadmin/accounts"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-link hover:underline"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Hisoblar
        </Link>

        <h1 className="m-0 text-2xl font-semibold">Yangi hisob</h1>
        <p className="m-0 text-sm text-text-secondary">
          Hisob yaratilgandan keyin egasi kirib, do‘konini o‘zi tuzadi.
        </p>
      </header>

      <Card>
        <CreateShopAdminForm />
      </Card>
    </div>
  );
}
