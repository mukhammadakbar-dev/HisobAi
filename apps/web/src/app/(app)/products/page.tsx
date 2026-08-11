'use client';

import { PackagePlus, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { EmptyState, ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Card, Input, Select } from '../../../components/ui';
import { Money } from '../../../components/money/money';
import { useBrands, useCategories, useProducts } from '../../../features/catalog/queries';
import { PRODUCT_TYPE_LABEL } from '../../../lib/labels';

/**
 * Katalog ro'yxati (§4).
 *
 * Qidiruv serverda, `display_name` bo'yicha (`products_display_name_trgm_idx`).
 * Filtr o'zgarganda eski ro'yxat ko'rinib turadi (`placeholderData`) —
 * har harfda jadval bo'shab, "topilmadi" bo'lib ko'rinmasin.
 */
export default function ProductsPage() {
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [isActive, setIsActive] = useState<'active' | 'archived' | 'all'>('active');

  const categories = useCategories();
  const brands = useBrands();
  const products = useProducts({
    q: q.trim() === '' ? undefined : q.trim(),
    categoryId: categoryId === '' ? undefined : categoryId,
    brandId: brandId === '' ? undefined : brandId,
    isActive,
  });

  const rows = products.data?.data ?? [];
  const isFiltered =
    q.trim() !== '' || categoryId !== '' || brandId !== '' || isActive !== 'active';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-2xl font-semibold">Katalog</h1>
          <p className="m-0 text-text-secondary">
            Mahsulot shablonlari. Tannarx bu yerda emas — u har ombor birligida (§4.1).
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/inventory/receive"
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border-default px-4 text-sm font-semibold text-text-primary hover:bg-surface-raised"
          >
            <PackagePlus size={16} aria-hidden="true" />
            Qabul qilish
          </Link>
          <Link
            href="/products/new"
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-action px-4 text-sm font-semibold text-action-text hover:bg-action-hover"
          >
            <Plus size={16} aria-hidden="true" />
            Mahsulot
          </Link>
        </div>
      </header>

      <Card className="flex flex-wrap gap-3">
        <div className="min-w-48 flex-2 basis-64">
          <label htmlFor="q" className="sr-only">
            Qidiruv
          </label>
          <Input
            id="q"
            type="search"
            placeholder="Nomi bo‘yicha qidirish"
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
            }}
          />
        </div>

        <div className="min-w-40 flex-1">
          <label htmlFor="categoryId" className="sr-only">
            Kategoriya
          </label>
          <Select
            id="categoryId"
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value);
            }}
          >
            <option value="">Barcha kategoriya</option>
            {(categories.data?.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-40 flex-1">
          <label htmlFor="brandId" className="sr-only">
            Brend
          </label>
          <Select
            id="brandId"
            value={brandId}
            onChange={(event) => {
              setBrandId(event.target.value);
            }}
          >
            <option value="">Barcha brend</option>
            {(brands.data?.data ?? []).map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-36 flex-1">
          <label htmlFor="isActive" className="sr-only">
            Holat
          </label>
          <Select
            id="isActive"
            value={isActive}
            onChange={(event) => {
              setIsActive(event.target.value as 'active' | 'archived' | 'all');
            }}
          >
            <option value="active">Faol</option>
            <option value="archived">Arxivda</option>
            <option value="all">Hammasi</option>
          </Select>
        </div>
      </Card>

      {products.isPending && (
        <Card>
          <TableSkeleton rows={6} />
        </Card>
      )}

      {products.isError && (
        <ErrorState
          error={products.error}
          onRetry={() => {
            void products.refetch();
          }}
        />
      )}

      {!products.isPending && !products.isError && rows.length === 0 && (
        <EmptyState
          title={isFiltered ? 'Bu filtr bo‘yicha topilmadi' : 'Hali mahsulot yo‘q'}
          actionLabel={isFiltered ? 'Filtrni tozalash' : undefined}
          onAction={
            isFiltered
              ? () => {
                  setQ('');
                  setCategoryId('');
                  setBrandId('');
                  setIsActive('active');
                }
              : undefined
          }
        />
      )}

      {rows.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-default text-left text-text-secondary">
                <th className="p-3 font-medium">Nomi</th>
                <th className="p-3 font-medium">Turi</th>
                <th className="p-3 text-right font-medium">Qoldiq</th>
                <th className="p-3 text-right font-medium">Tavsiya narxi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((product) => (
                <tr key={product.id} className="border-b border-border-default last:border-0">
                  <td className="p-3">
                    <Link
                      href={`/products/${product.id}`}
                      className="font-medium text-link hover:underline"
                    >
                      {product.displayName}
                    </Link>
                    <div className="text-text-tertiary">
                      {product.categoryName}
                      {!product.isActive && ' · arxivda'}
                    </div>
                  </td>
                  <td className="p-3 text-text-secondary">{PRODUCT_TYPE_LABEL[product.type]}</td>
                  <td className="p-3 text-right">
                    <span className="tabular">{product.stock.available}</span>
                    {product.stock.isLowStock && (
                      <span className="ml-2">
                        <Badge tone="warning">Kam qoldiq</Badge>
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <Money amount={product.suggestedPrice} currency={product.currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {products.data?.hasMore && (
        <p className="m-0 text-sm text-text-tertiary">
          Birinchi {rows.length} ta ko‘rsatildi — qidiruv bilan toraytiring.
        </p>
      )}
    </div>
  );
}
