'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type {
  InventoryBatchDto,
  InventoryItemDetailDto,
  InventoryItemDto,
  Page,
  ReceiveInput,
  ReceiveResultDto,
  StockMovementDto,
} from '@hisobai/contracts';

import { api } from '../../lib/api-client';
import type { ApiError } from '../../lib/api-error';
import { catalogKeys } from '../catalog/queries';

/**
 * Ombor so'rovlari (§5).
 *
 * `FRONTEND.md` §5.3 — qabul qilish `inventory` va `products` ni
 * yangilaydi: qoldiq va `lastCostPrice` mahsulot kartasida ko'rinadi.
 */

export interface InventoryFilters {
  q?: string;
  productId?: string;
  status?: string;
}

export const inventoryKeys = {
  all: ['inventory'] as const,
  items: (filters: InventoryFilters) => [...inventoryKeys.all, 'items', filters] as const,
  item: (id: string) => [...inventoryKeys.all, 'item', id] as const,
  batches: (productId?: string) => [...inventoryKeys.all, 'batches', productId ?? null] as const,
  movements: (productId?: string) =>
    [...inventoryKeys.all, 'movements', productId ?? null] as const,
};

export const inventoryApi = {
  items: (filters: InventoryFilters): Promise<Page<InventoryItemDto>> =>
    api.get('/inventory', { query: { ...filters, limit: 50 } }),
  item: (id: string): Promise<InventoryItemDetailDto> => api.get(`/inventory/${id}`),
  batches: (productId?: string): Promise<Page<InventoryBatchDto>> =>
    api.get('/inventory/batches', { query: { productId, limit: 50 } }),
  movements: (productId?: string): Promise<Page<StockMovementDto>> =>
    api.get('/inventory/movements', { query: { productId, limit: 50 } }),
  receive: (input: ReceiveInput, idempotencyKey: string): Promise<ReceiveResultDto> =>
    api.post('/inventory/receive', input, { idempotencyKey }),
};

/**
 * `enabled` — savdo formasi uchun: mahsulot tanlanmaguncha so'rov
 * yuborilmasin. Filtrsiz `GET /inventory` butun omborni tortib kelardi
 * va u savat qatoriga hech qanday foyda bermaydi.
 */
export function useInventoryItems(
  filters: InventoryFilters,
  enabled = true,
): UseQueryResult<Page<InventoryItemDto>, ApiError> {
  return useQuery<Page<InventoryItemDto>, ApiError>({
    queryKey: inventoryKeys.items(filters),
    queryFn: () => inventoryApi.items(filters),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useInventoryItem(id: string): UseQueryResult<InventoryItemDetailDto, ApiError> {
  return useQuery<InventoryItemDetailDto, ApiError>({
    queryKey: inventoryKeys.item(id),
    queryFn: () => inventoryApi.item(id),
  });
}

export function useBatches(
  productId?: string,
  enabled = true,
): UseQueryResult<Page<InventoryBatchDto>, ApiError> {
  return useQuery<Page<InventoryBatchDto>, ApiError>({
    queryKey: inventoryKeys.batches(productId),
    queryFn: () => inventoryApi.batches(productId),
    enabled,
  });
}

export function useMovements(productId?: string): UseQueryResult<Page<StockMovementDto>, ApiError> {
  return useQuery<Page<StockMovementDto>, ApiError>({
    queryKey: inventoryKeys.movements(productId),
    queryFn: () => inventoryApi.movements(productId),
  });
}

/**
 * Qabul qilish (§5.11).
 *
 * `Idempotency-Key` **chaqiruvchidan** keladi va u formani ochganda bir
 * marta yaratiladi (`API.md` §4.2). Kalit shu yerda yaratilsa, har
 * `mutate` yangi kalit olardi va aynan himoya qilinishi kerak bo'lgan
 * holat — "tugma ikki marta bosildi" — himoyasiz qolardi.
 */
export function useReceiveInventory(): UseMutationResult<
  ReceiveResultDto,
  ApiError,
  { input: ReceiveInput; idempotencyKey: string }
> {
  const queryClient = useQueryClient();

  return useMutation<ReceiveResultDto, ApiError, { input: ReceiveInput; idempotencyKey: string }>({
    mutationFn: ({ input, idempotencyKey }) => inventoryApi.receive(input, idempotencyKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      // Qoldiq va `lastCostPrice` katalogda ko'rinadi
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
    },
  });
}
