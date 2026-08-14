import type { Metadata } from 'next';

import { ShopSetupForm } from '../../../features/shops/components/shop-setup-form';

export const metadata: Metadata = { title: 'Do‘kon yaratish · HisobAI' };

/**
 * §25.6 — SHOP_ADMIN login qilganda Shop biriktirilmagan bo'lsa shu
 * ekran ko'rsatiladi. Sahifada biznes mantiq yo'q (`FRONTEND.md` §3).
 */
export default function SetupShopPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-xl font-semibold">Do‘koningizni yarating</h1>
        <p className="m-0 text-sm text-text-secondary">
          Ishni boshlash uchun do‘kon nomi yetarli. Qolgan sozlamalarni keyin o‘zgartirasiz.
        </p>
      </div>

      <ShopSetupForm />
    </div>
  );
}
