'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { TaxonomyManager } from '../../../../features/catalog/components/taxonomy-manager';
import { useCurrentUser } from '../../../../features/auth/queries';
import { can } from '../../../../lib/permissions';

/**
 * Katalog sozlamalari (§4.4 — "sozlamalarda tahrirlash va birlashtirish").
 *
 * Ikkita mustaqil blok: kategoriya va brend. Har biri o'z so'rovi va o'z
 * holatlariga ega — bittasi yiqilsa ikkinchisi ishlayveradi
 * (`FRONTEND.md` §7).
 *
 * Mahsulotning o'zi bu yerda emas: u `/products` da. Bu ekran faqat
 * **taksonomiya** uchun — kamdan-kam ochiladigan, lekin katalog
 * ifloslanganda zarur bo'ladigan amallar.
 */
export default function CatalogSettingsPage() {
  const user = useCurrentUser();
  const canEdit = can(user.data, 'catalog.edit');

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/settings"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-link hover:underline"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Sozlamalar
        </Link>
        <h1 className="m-0 text-2xl font-semibold">Katalog</h1>
        <p className="m-0 text-text-secondary">
          Kategoriya va brendlarni tahrirlash, arxivlash va birlashtirish. Bir xil narsa ikki nom
          bilan yozilgan bo‘lsa, ularni birlashtiring — aks holda qoldiq va foyda ikkiga bo‘linadi.
        </p>
      </header>

      <TaxonomyManager kind="category" canEdit={canEdit} />
      <TaxonomyManager kind="brand" canEdit={canEdit} />
    </div>
  );
}
