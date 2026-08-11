'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type {
  CreateProductInput,
  Page,
  ProductDto,
  TaxonomyDto,
  TaxonomyMergeResultDto,
  UpdateCategoryInput,
  UpdateProductInput,
} from '@hisobai/contracts';

import { api } from '../../lib/api-client';
import type { ApiError } from '../../lib/api-error';

/**
 * Katalog so'rovlari (§4).
 *
 * Kalitlar `FRONTEND.md` §5.3 dagi shaklda. Filtrlar kalit ichida
 * turadi: filtr o'zgarganda TanStack Query yangi so'rov yuboradi va eski
 * natijani ko'rsatib turmaydi.
 */

export interface ProductFilters {
  q?: string;
  categoryId?: string;
  brandId?: string;
  isActive?: 'active' | 'archived' | 'all';
  limit?: number;
}

/**
 * Kategoriya va brend bir xil shaklda (`TaxonomyDto`), shuning uchun
 * so'rovlar ham bitta joyda — servis (`taxonomy.service.ts`) va sxema
 * (`schemas/catalog.ts`) allaqachon shu tanlovni qilgan. Ikki nusxa
 * yozilsa, biri tuzatilib ikkinchisi eskirib qolardi.
 */
export type TaxonomyKind = 'category' | 'brand';

export interface TaxonomyFilters {
  isActive?: 'active' | 'archived' | 'all';
}

const TAXONOMY_PATH: Record<TaxonomyKind, string> = {
  category: '/categories',
  brand: '/brands',
};

const TAXONOMY_KEY: Record<TaxonomyKind, string> = {
  category: 'categories',
  brand: 'brands',
};

export const catalogKeys = {
  all: ['catalog'] as const,
  /** Filtrsiz ildiz — invalidatsiya shu prefiks bo'yicha ketadi. */
  taxonomy: (kind: TaxonomyKind) => [...catalogKeys.all, TAXONOMY_KEY[kind]] as const,
  taxonomyList: (kind: TaxonomyKind, filters: TaxonomyFilters) =>
    [...catalogKeys.taxonomy(kind), filters] as const,
  categories: () => catalogKeys.taxonomy('category'),
  brands: () => catalogKeys.taxonomy('brand'),
  products: (filters: ProductFilters) => [...catalogKeys.all, 'products', filters] as const,
  product: (id: string) => [...catalogKeys.all, 'product', id] as const,
};

export const catalogApi = {
  taxonomy: (kind: TaxonomyKind, filters: TaxonomyFilters): Promise<Page<TaxonomyDto>> =>
    api.get(TAXONOMY_PATH[kind], { query: { ...filters, limit: 200, sort: 'name' } }),
  createTaxonomy: (kind: TaxonomyKind, name: string): Promise<TaxonomyDto> =>
    api.post(TAXONOMY_PATH[kind], { name }),
  updateTaxonomy: (
    kind: TaxonomyKind,
    id: string,
    input: UpdateCategoryInput,
  ): Promise<TaxonomyDto> => api.patch(`${TAXONOMY_PATH[kind]}/${id}`, input),
  mergeTaxonomy: (
    kind: TaxonomyKind,
    id: string,
    input: { targetId: string; expectedUpdatedAt: string },
  ): Promise<TaxonomyMergeResultDto> => api.post(`${TAXONOMY_PATH[kind]}/${id}/merge`, input),

  products: (filters: ProductFilters): Promise<Page<ProductDto>> =>
    api.get('/products', { query: { ...filters, limit: filters.limit ?? 50 } }),
  product: (id: string): Promise<ProductDto> => api.get(`/products/${id}`),
  createProduct: (input: CreateProductInput): Promise<ProductDto> => api.post('/products', input),
  updateProduct: (id: string, input: UpdateProductInput): Promise<ProductDto> =>
    api.patch(`/products/${id}`, input),
};

export function useTaxonomy(
  kind: TaxonomyKind,
  filters: TaxonomyFilters = { isActive: 'active' },
): UseQueryResult<Page<TaxonomyDto>, ApiError> {
  return useQuery<Page<TaxonomyDto>, ApiError>({
    queryKey: catalogKeys.taxonomyList(kind, filters),
    queryFn: () => catalogApi.taxonomy(kind, filters),
    // Filtr o'zgarganda ro'yxat ko'rinib tursin — jadval sakramaydi
    placeholderData: (previous) => previous,
  });
}

/** Formalarda faqat **faol** yozuvlar tanlanadi (`CATALOG_TAXONOMY_ARCHIVED`). */
export function useCategories(): UseQueryResult<Page<TaxonomyDto>, ApiError> {
  return useTaxonomy('category');
}

export function useBrands(): UseQueryResult<Page<TaxonomyDto>, ApiError> {
  return useTaxonomy('brand');
}

/** §4.4 — yangi kategoriya/brendni mahsulot formasidan qo'shish. */
export function useCreateTaxonomy(
  kind: TaxonomyKind,
): UseMutationResult<TaxonomyDto, ApiError, string> {
  const queryClient = useQueryClient();

  return useMutation<TaxonomyDto, ApiError, string>({
    mutationFn: (name) => catalogApi.createTaxonomy(kind, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKeys.taxonomy(kind) }),
  });
}

export function useCreateCategory(): UseMutationResult<TaxonomyDto, ApiError, string> {
  return useCreateTaxonomy('category');
}

export function useCreateBrand(): UseMutationResult<TaxonomyDto, ApiError, string> {
  return useCreateTaxonomy('brand');
}

/**
 * §4.4, §4.8 — nomni o'zgartirish va arxivlash.
 *
 * Butun `catalog` keshi yangilanadi, faqat taksonomiya ro'yxati emas:
 * brend nomi mahsulot nomiga kiradi (§4.6) va server uni qayta yig'adi,
 * ya'ni `/products` javobi ham eskiradi.
 */
export function useUpdateTaxonomy(
  kind: TaxonomyKind,
): UseMutationResult<TaxonomyDto, ApiError, { id: string; input: UpdateCategoryInput }> {
  const queryClient = useQueryClient();

  return useMutation<TaxonomyDto, ApiError, { id: string; input: UpdateCategoryInput }>({
    mutationFn: ({ id, input }) => catalogApi.updateTaxonomy(kind, id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKeys.all }),
  });
}

/** §4.4 — birlashtirish: mahsulotlar nishonga o'tadi, manba arxivlanadi. */
export function useMergeTaxonomy(
  kind: TaxonomyKind,
): UseMutationResult<
  TaxonomyMergeResultDto,
  ApiError,
  { id: string; targetId: string; expectedUpdatedAt: string }
> {
  const queryClient = useQueryClient();

  return useMutation<
    TaxonomyMergeResultDto,
    ApiError,
    { id: string; targetId: string; expectedUpdatedAt: string }
  >({
    mutationFn: ({ id, targetId, expectedUpdatedAt }) =>
      catalogApi.mergeTaxonomy(kind, id, { targetId, expectedUpdatedAt }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKeys.all }),
  });
}

export function useProducts(filters: ProductFilters): UseQueryResult<Page<ProductDto>, ApiError> {
  return useQuery<Page<ProductDto>, ApiError>({
    queryKey: catalogKeys.products(filters),
    queryFn: () => catalogApi.products(filters),
    // Filtr o'zgarganda oldingi ro'yxat ko'rinib tursin — jadval
    // sakramaydi va qidiruv "yo'q" holatiga tushib qolmaydi
    placeholderData: (previous) => previous,
  });
}

export function useProduct(id: string): UseQueryResult<ProductDto, ApiError> {
  return useQuery<ProductDto, ApiError>({
    queryKey: catalogKeys.product(id),
    queryFn: () => catalogApi.product(id),
  });
}

export function useCreateProduct(): UseMutationResult<ProductDto, ApiError, CreateProductInput> {
  const queryClient = useQueryClient();

  return useMutation<ProductDto, ApiError, CreateProductInput>({
    mutationFn: catalogApi.createProduct,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKeys.all }),
  });
}

export function useUpdateProduct(
  id: string,
): UseMutationResult<ProductDto, ApiError, UpdateProductInput> {
  const queryClient = useQueryClient();

  return useMutation<ProductDto, ApiError, UpdateProductInput>({
    mutationFn: (input) => catalogApi.updateProduct(id, input),
    onSuccess: (product) => {
      // Javobdagi yangi `updatedAt` keshga tushadi — ketma-ket ikkinchi
      // saqlash eski qulf tokeni bilan ketmaydi (`API.md` §8)
      queryClient.setQueryData(catalogKeys.product(id), product);
      /**
       * Brend nomi mahsulot nomiga kiradi (§4.6), ya'ni tahrir
       * ro'yxatdagi nomni ham o'zgartiradi — butun katalog yangilanadi.
       */
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
    },
  });
}
