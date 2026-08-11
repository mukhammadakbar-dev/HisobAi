'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type {
  CreateProductInput,
  Page,
  ProductDto,
  TaxonomyDto,
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

export const catalogKeys = {
  all: ['catalog'] as const,
  categories: () => [...catalogKeys.all, 'categories'] as const,
  brands: () => [...catalogKeys.all, 'brands'] as const,
  products: (filters: ProductFilters) => [...catalogKeys.all, 'products', filters] as const,
  product: (id: string) => [...catalogKeys.all, 'product', id] as const,
};

export const catalogApi = {
  categories: (): Promise<Page<TaxonomyDto>> =>
    api.get('/categories', { query: { limit: 200, sort: 'name' } }),
  brands: (): Promise<Page<TaxonomyDto>> =>
    api.get('/brands', { query: { limit: 200, sort: 'name' } }),
  createCategory: (name: string): Promise<TaxonomyDto> => api.post('/categories', { name }),
  createBrand: (name: string): Promise<TaxonomyDto> => api.post('/brands', { name }),

  products: (filters: ProductFilters): Promise<Page<ProductDto>> =>
    api.get('/products', { query: { ...filters, limit: filters.limit ?? 50 } }),
  product: (id: string): Promise<ProductDto> => api.get(`/products/${id}`),
  createProduct: (input: CreateProductInput): Promise<ProductDto> => api.post('/products', input),
  updateProduct: (id: string, input: UpdateProductInput): Promise<ProductDto> =>
    api.patch(`/products/${id}`, input),
};

export function useCategories(): UseQueryResult<Page<TaxonomyDto>, ApiError> {
  return useQuery<Page<TaxonomyDto>, ApiError>({
    queryKey: catalogKeys.categories(),
    queryFn: catalogApi.categories,
  });
}

export function useBrands(): UseQueryResult<Page<TaxonomyDto>, ApiError> {
  return useQuery<Page<TaxonomyDto>, ApiError>({
    queryKey: catalogKeys.brands(),
    queryFn: catalogApi.brands,
  });
}

/** §4.4 — yangi kategoriya/brendni mahsulot formasidan qo'shish. */
export function useCreateCategory(): UseMutationResult<TaxonomyDto, ApiError, string> {
  const queryClient = useQueryClient();

  return useMutation<TaxonomyDto, ApiError, string>({
    mutationFn: catalogApi.createCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKeys.categories() }),
  });
}

export function useCreateBrand(): UseMutationResult<TaxonomyDto, ApiError, string> {
  const queryClient = useQueryClient();

  return useMutation<TaxonomyDto, ApiError, string>({
    mutationFn: catalogApi.createBrand,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: catalogKeys.brands() }),
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
