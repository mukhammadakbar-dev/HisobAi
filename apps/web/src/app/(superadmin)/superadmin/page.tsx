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
  /**
   * `!== ACTIVE`, ya'ni `SUSPENDED` va `DISABLED` birga. Yorliq shuning
   * uchun "Faol emas": "To'xtatilgan" `SUSPENDED` ning yorlig'i
   * (`lib/labels.ts`) va o'chirilgan hisobni ham shunday atash — bir xil
   * hisob ikki ekranda ikki xil nomlanishi degani.
   */
  const inactive = rows.filter((row) => row.status !== AccountStatus.ACTIVE).length;
  const withoutShop = rows.filter((row) => row.shopId === null).length;

  /**
   * Ro'yxat kursorli va bitta sahifa 50 tagacha qator qaytaradi, ya'ni
   * `hasMore` bo'lsa bu raqamlar BUTUN platformani emas, faqat birinchi
   * sahifani sanaydi. Kesilgan raqamni "Jami hisob" deb ko'rsatish —
   * §19.1 va §20.2 da rad etilgan naqshning o'zi: yolg'on ma'noli
   * raqamni chizish. Aniq sonni bermaymiz, lekin buni yashirmaymiz ham.
   */
  const isPartial = admins.data.hasMore;
  const shown = (value: number): string => (isPartial ? `${String(value)}+` : String(value));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-semibold">Boshqaruv</h1>
        <p className="m-0 text-sm text-text-secondary">Platforma hisoblari holati.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Jami hisob" value={shown(rows.length)} />
        <Stat label="Faol" value={shown(active)} />
        <Stat label="Faol emas" value={shown(inactive)} />
        <Stat label="Do‘kon tuzmagan" value={shown(withoutShop)} />
      </div>

      {isPartial && (
        <p className="m-0 text-sm text-text-tertiary">
          Raqamlar birinchi {rows.length} ta hisob bo‘yicha — ro‘yxat undan uzunroq.
        </p>
      )}

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <div className="text-sm text-text-secondary">{label}</div>
      <div className="tabular text-2xl font-semibold">{value}</div>
    </Card>
  );
}
