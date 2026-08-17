'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Currency, FileKind, ProductType, buildDisplayName, createProductSchema } from '@hisobai/contracts';
import type { CreateProductInput, ProductDto } from '@hisobai/contracts';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { FileUpload } from '../../../components/files';
import { MoneyInput } from '../../../components/money/money-input';
import { Button, Card, Field, Input, Select } from '../../../components/ui';
import { applyApiFieldErrors, isFieldOwnedError } from '../../../lib/form-errors';
import { PRODUCT_TYPE_LABEL } from '../../../lib/labels';
import { FormError } from '../../auth/components/form-error';
import {
  useBrands,
  useCategories,
  useCreateBrand,
  useCreateCategory,
  useCreateProduct,
  useUpdateProduct,
} from '../queries';
import { TaxonomySelect } from './taxonomy-select';

/**
 * Mahsulot shabloni formasi (§4.5).
 *
 * Bitta forma ikkala rejimda ishlaydi. Tahrirda **hamma maydon**
 * yuboriladi va sxema bitta bo'lib qoladi: ikkita sxema ikkita qoida
 * to'plamiga aylanib, biri ikkinchisidan chetga chiqishi mumkin edi
 * (`FRONTEND.md` §6.1). Parallel tahrirdan optimistik qulf himoya
 * qiladi — `expectedUpdatedAt` forma **yuklangan** versiyaga bog'lanadi.
 *
 * `displayName` formada yo'q: u §4.6 bo'yicha serverda yig'iladi. Bu
 * yerda faqat **jonli ko'rinish** ko'rsatiladi — bir xil funksiya bilan,
 * ya'ni ekrandagi nom saqlangan nomdan farq qilmaydi.
 */

const FIELDS = [
  'categoryId',
  'brandId',
  'model',
  'storage',
  'color',
  'type',
  'currency',
  'suggestedPrice',
  'lowStockThreshold',
  'description',
  'imageFileId',
] as const;

/**
 * Forma qiymatlari — sxemaning **kirish** tipi: `decimalString` sonni ham
 * qabul qiladi va ichkarida satrga aylantiradi. Chiqish tipi
 * (`CreateProductInput`) `handleSubmit` dan keladi, ya'ni mutatsiyaga
 * allaqachon tekshirilgan qiymat tushadi (`FRONTEND.md` §6.1).
 */
interface ProductFormValues {
  categoryId: string;
  brandId: string;
  model: string;
  storage: string | null;
  color: string | null;
  type: CreateProductInput['type'];
  currency: CreateProductInput['currency'];
  suggestedPrice: string | number | null;
  lowStockThreshold: number | null;
  description: string | null;
  imageFileId?: string | null;
}

function toFormValues(product: ProductDto | undefined): ProductFormValues {
  return {
    categoryId: product?.categoryId ?? '',
    brandId: product?.brandId ?? '',
    model: product?.model ?? '',
    storage: product?.storage ?? null,
    color: product?.color ?? null,
    type: product?.type ?? ProductType.SERIALIZED,
    currency: product?.currency ?? Currency.UZS,
    suggestedPrice: product?.suggestedPrice ?? null,
    lowStockThreshold: product?.lowStockThreshold ?? null,
    description: product?.description ?? null,
    imageFileId: product?.imageFileId ?? null,
  };
}

/** Bo'sh maydon — "yo'q", nol yoki bo'sh satr emas. */
const optionalText = (value: string): string | null => (value.trim() === '' ? null : value);
const optionalNumber = (value: string): number | null => (value === '' ? null : Number(value));

export function ProductForm({ product }: { product?: ProductDto }) {
  const router = useRouter();
  const categories = useCategories();
  const brands = useBrands();
  const createCategory = useCreateCategory();
  const createBrand = useCreateBrand();
  const create = useCreateProduct();
  const update = useUpdateProduct(product?.id ?? '');

  const mutation = product ? update : create;

  /**
   * Turi va valyutasi qulflanadimi (§18.7).
   *
   * **Bu server qoidasining to'liq nusxasi emas.** Server **barcha**
   * ombor qatorlarini sanaydi, `stock.available` esa faqat `AVAILABLE`
   * birliklarni ko'rsatadi. Farq savdo qo'shilgandan keyin (5-bosqich)
   * ko'rinadi: hamma birligi sotilgan mahsulotda maydonlar ochiq
   * ko'rinadi va saqlashda `422 CATALOG_PRODUCT_HAS_STOCK` qaytadi.
   * Xato tushunarli va ma'lumot buzilmaydi, lekin to'g'ri yechim —
   * `ProductDto.stock` ga "umuman yozuv bormi" belgisini qo'shish; u
   * kontrakt o'zgarishi va savdo bosqichida qilinadi.
   */
  const hasStock = product ? product.stock.available > 0 : false;

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<ProductFormValues, unknown, CreateProductInput>({
    resolver: zodResolver(createProductSchema),
    defaultValues: toFormValues(product),
  });

  const values = watch();
  const brandName = brands.data?.data.find((brand) => brand.id === values.brandId)?.name ?? '';
  const preview = buildDisplayName({
    brandName,
    model: values.model,
    storage: values.storage,
    color: values.color,
  });

  const onSubmit = handleSubmit((input) => {
    const onError = (error: unknown): void => {
      applyApiFieldErrors(error, setError, FIELDS);
    };

    if (product) {
      update.mutate(
        // Qulf tokeni forma yuklangan versiyaga bog'lanadi (`API.md` §8)
        { ...input, expectedUpdatedAt: product.updatedAt },
        {
          onSuccess: () => {
            router.push(`/products/${product.id}`);
          },
          onError,
        },
      );
      return;
    }

    create.mutate(input, {
      onSuccess: (created) => {
        router.push(`/products/${created.id}`);
      },
      onError,
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {!isFieldOwnedError(mutation.error, FIELDS) && <FormError error={mutation.error} />}

      <Card className="flex flex-col gap-4">
        <TaxonomySelect
          id="categoryId"
          label="Kategoriya"
          value={values.categoryId}
          options={categories.data?.data ?? []}
          isLoading={categories.isPending}
          error={errors.categoryId?.message}
          onChange={(value) => {
            setValue('categoryId', value, { shouldDirty: true, shouldValidate: true });
          }}
          onCreate={createCategory.mutateAsync}
          createError={createCategory.error}
          isCreating={createCategory.isPending}
        />

        <TaxonomySelect
          id="brandId"
          label="Brend"
          value={values.brandId}
          options={brands.data?.data ?? []}
          isLoading={brands.isPending}
          error={errors.brandId?.message}
          onChange={(value) => {
            setValue('brandId', value, { shouldDirty: true, shouldValidate: true });
          }}
          onCreate={createBrand.mutateAsync}
          createError={createBrand.error}
          isCreating={createBrand.isPending}
        />

        <Field label="Model" htmlFor="model" error={errors.model?.message}>
          <Input id="model" placeholder="iPhone 15 Pro" {...register('model')} />
        </Field>

        <div className="flex flex-wrap gap-4">
          <div className="flex-1 basis-40">
            <Field label="Xotira" htmlFor="storage" error={errors.storage?.message}>
              <Input
                id="storage"
                placeholder="256GB"
                {...register('storage', { setValueAs: optionalText })}
              />
            </Field>
          </div>
          <div className="flex-1 basis-40">
            <Field label="Rang" htmlFor="color" error={errors.color?.message}>
              <Input
                id="color"
                placeholder="Qora"
                {...register('color', { setValueAs: optionalText })}
              />
            </Field>
          </div>
        </div>

        {/* §4.7 — aksessuarda xotira va rang bo'sh qoladi va nomdan tushib ketadi */}
        <p className="m-0 text-sm text-text-tertiary">
          Nomi avtomatik yig‘iladi:{' '}
          <span className="font-medium text-text-secondary">{preview || '—'}</span>
        </p>
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 basis-48">
            <Field label="Turi" htmlFor="type" error={errors.type?.message}>
              <Select id="type" disabled={hasStock} {...register('type')}>
                {Object.values(ProductType).map((type) => (
                  <option key={type} value={type}>
                    {PRODUCT_TYPE_LABEL[type]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex-1 basis-48">
            <Field label="Valyuta" htmlFor="currency" error={errors.currency?.message}>
              <Select id="currency" disabled={hasStock} {...register('currency')}>
                {Object.values(Currency).map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        {hasStock && (
          <p className="m-0 text-sm text-text-tertiary">
            Omborda qoldiq bor — turi va valyutasi o‘zgartirilmaydi. Mavjud tannarxlar aynan shu
            valyutada saqlangan.
          </p>
        )}

        <Field
          label={`Tavsiya narxi (${values.currency})`}
          htmlFor="suggestedPrice"
          error={errors.suggestedPrice?.message}
        >
          <MoneyInput
            id="suggestedPrice"
            currency={values.currency}
            value={values.suggestedPrice === null ? '' : String(values.suggestedPrice)}
            onChange={(value) => {
              setValue('suggestedPrice', value === '' ? null : value, { shouldDirty: true });
            }}
            aria-describedby="suggestedPrice-hint"
          />
        </Field>
        <p id="suggestedPrice-hint" className="m-0 text-sm text-text-tertiary">
          Faqat ma’lumot uchun — haqiqiy narx savdo paytida qo‘yiladi (§4.2).
        </p>

        <Field
          label="Kam qoldiq chegarasi"
          htmlFor="lowStockThreshold"
          error={errors.lowStockThreshold?.message}
        >
          <Input
            id="lowStockThreshold"
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="Sozlamalardagi umumiy chegara"
            {...register('lowStockThreshold', { setValueAs: optionalNumber })}
          />
        </Field>

        <Field label="Tavsif" htmlFor="description" error={errors.description?.message}>
          <Input id="description" {...register('description', { setValueAs: optionalText })} />
        </Field>

        {/* §18.1 — mahsulot rasmi */}
        <FileUpload
          kind={FileKind.PRODUCT_IMAGE}
          accept="image/jpeg,image/png,image/webp"
          label="Mahsulot rasmi"
          existingFileId={product?.imageFileId ?? null}
          onUploaded={(fileId) => {
            setValue('imageFileId', fileId, { shouldDirty: true });
          }}
        />
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saqlanmoqda…' : product ? 'Saqlash' : 'Qo‘shish'}
        </Button>
        <Button
          type="button"
          onClick={() => {
            router.back();
          }}
        >
          Bekor qilish
        </Button>
      </div>
    </form>
  );
}
