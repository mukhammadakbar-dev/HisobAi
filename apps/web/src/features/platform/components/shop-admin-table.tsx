'use client';

import Link from 'next/link';
import type { ShopAdminDto } from '@hisobai/contracts';

import { Badge } from '../../../components/ui';
import { EmptyState } from '../../../components/states';
import { formatDate } from '../../../lib/format';
import { ACCOUNT_STATUS_LABEL, ACCOUNT_STATUS_TONE } from '../../../lib/labels';

/**
 * SHOP_ADMIN hisoblari ro'yxati (§25.3).
 *
 * Ustunlar ataylab qisqa: bu yerda **biznes ma'lumot yo'q** (§25.3 —
 * SUPERADMIN mijoz, savdo, kassa va hisobotlarga kira olmaydi). "Do'kon"
 * ustuni ham do'kon **nomini emas**, faqat yaratilgan-yaratilmaganini
 * ko'rsatadi: nom Shop'ning o'z ma'lumoti va u tenant chegarasining
 * narigi tomonida (§25.10).
 */
export function ShopAdminTable({ admins }: { admins: ShopAdminDto[] }) {
  if (admins.length === 0) {
    return (
      <EmptyState title="Hali hisob yaratilmagan" />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-default text-left text-text-secondary">
            <th className="py-2 pr-4 font-medium">Egasi</th>
            <th className="py-2 pr-4 font-medium">Email</th>
            <th className="py-2 pr-4 font-medium">Holat</th>
            <th className="py-2 pr-4 font-medium">Do‘kon</th>
            <th className="py-2 font-medium">Yaratilgan</th>
          </tr>
        </thead>
        <tbody>
          {admins.map((admin) => (
            <tr key={admin.id} className="border-b border-border-default last:border-0">
              <td className="py-3 pr-4">
                <Link
                  href={`/superadmin/accounts/${admin.id}`}
                  className="font-medium text-link underline-offset-2 hover:underline"
                >
                  {admin.displayName}
                </Link>
              </td>
              <td className="py-3 pr-4 text-text-secondary">{admin.email}</td>
              <td className="py-3 pr-4">
                <Badge tone={ACCOUNT_STATUS_TONE[admin.status] ?? 'muted'}>
                  {ACCOUNT_STATUS_LABEL[admin.status] ?? admin.status}
                </Badge>
              </td>
              <td className="py-3 pr-4">
                {admin.shopId === null ? (
                  // §25.5 — hisob yaratilgan, Shop'ni egasi o'zi tuzadi.
                  // Bu kutilgan oraliq holat, xato emas.
                  <Badge tone="warning">Yaratilmagan</Badge>
                ) : (
                  <Badge tone="success">Bor</Badge>
                )}
              </td>
              <td className="tabular py-3 text-text-secondary">{formatDate(admin.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
