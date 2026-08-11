'use client';

import { ArchiveRestore, ArrowLeft, PackagePlus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { Money } from '../../../../components/money/money';
import { ErrorState, TableSkeleton } from '../../../../components/states';
import { Badge, Button, Card } from '../../../../components/ui';
import { ProductForm } from '../../../../features/catalog/components/product-form';
import { useProduct, useUpdateProduct } from '../../../../features/catalog/queries';
import { useCurrentUser } from '../../../../features/auth/queries';
import { PRODUCT_TYPE_LABEL } from '../../../../lib/labels';
import { errorMessage } from '../../../../lib/messages';
import { can } from '../../../../lib/permissions';

/**
 * Mahsulot kartasi va tahriri (§4.5, §4.8).
 *
 * Arxivlash alohida tugmada, formada emas: u boshqa turdagi amal —
 * bitta bosishda bajariladi va tasdiqni talab qiladi. Formaning
 * "Saqlash" tugmasi bilan aralashsa, tasodifiy arxivlash oson bo'lardi.
 */
export default function ProductPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const product = useProduct(id);
  const update = useUpdateProduct(id);
  const user = useCurrentUser();

  if (product.isPending) {
    return (
      <Card>
        <TableSkeleton rows={5} />
      </Card>
    );
  }

  if (product.isError) {
    return (
      <ErrorState
        error={product.error}
        onRetry={() => {
          void product.refetch();
        }}
      />
    );
  }

  const data = product.data;

  const toggleArchive = (): void => {
    update.mutate({ isActive: !data.isActive, expectedUpdatedAt: data.updatedAt });
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/products"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-link hover:underline"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Katalog
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="m-0 text-2xl font-semibold">{data.displayName}</h1>
          <Badge tone="info">{PRODUCT_TYPE_LABEL[data.type]}</Badge>
          {!data.isActive && <Badge tone="muted">Arxivda</Badge>}
          {data.stock.isLowStock && <Badge tone="warning">Kam qoldiq</Badge>}
        </div>

        <p className="m-0 text-text-secondary">
          {data.categoryName} · {data.brandName}
        </p>
      </header>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-6">
          <div>
            <div className="text-sm text-text-secondary">Sotuvga tayyor</div>
            <div className="tabular text-xl font-semibold">{data.stock.available}</div>
          </div>
          {/* `PERMISSIONS.md` P7 — tannarx rolga bog'liq maydon */}
          {can(user.data, 'cost.view') && (
            <div>
              <div className="text-sm text-text-secondary">Oxirgi tannarx</div>
              <div className="text-xl font-semibold">
                <Money amount={data.lastCostPrice} currency={data.currency} />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {data.isActive && (
            <Link
              href={`/inventory/receive?productId=${data.id}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-action px-4 text-sm font-semibold text-action-text hover:bg-action-hover"
            >
              <PackagePlus size={16} aria-hidden="true" />
              Qabul qilish
            </Link>
          )}
          <Button type="button" onClick={toggleArchive} disabled={update.isPending}>
            <ArchiveRestore size={16} aria-hidden="true" className="mr-2" />
            {data.isActive ? 'Arxivlash' : 'Tiklash'}
          </Button>
        </div>
      </Card>

      {update.isError && (
        <p className="m-0 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
          {errorMessage(update.error)}
        </p>
      )}

      <ProductForm key={data.updatedAt} product={data} />
    </div>
  );
}
