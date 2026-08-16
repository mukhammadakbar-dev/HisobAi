'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type {
  CancelSaleInput,
  ConfirmSaleInput,
  CreateSaleDraftInput,
  Page,
  ReturnSaleInput,
  SaleDto,
  SaleSummaryDto,
  UpdateSaleDraftInput,
} from '@hisobai/contracts';

import { api } from '../../lib/api-client';
import type { ApiError } from '../../lib/api-error';
import { cashKeys } from '../cashbook/queries';
import { catalogKeys } from '../catalog/queries';
import { customerKeys } from '../customers/queries';
import { dashboardKeys } from '../dashboard/queries';
import { inventoryKeys } from '../inventory/queries';

/**
 * Savdo so'rovlari (§7).
 *
 * Ikki bosqichli oqim keshda ham ko'rinadi:
 *
 *  - **qoralama** hech narsaga ta'sir qilmaydi (§7.7), shuning uchun
 *    yaratish va yangilash faqat savdo ro'yxatini yangilaydi;
 *  - **tasdiqlash** esa ombor, kassa, mijoz qarzi va dashboard'ni
 *    birdaniga o'zgartiradi (`ARCHITECTURE.md` §6), ya'ni o'sha
 *    keshlarning hammasi eskiradi. Bittasi unutilsa, ega sotilgan
 *    telefonni omborda "mavjud" holida ko'rib turaveradi.
 */

export interface SaleFilters {
  status?: string;
  customerId?: string;
  from?: string;
  to?: string;
}

export const saleKeys = {
  all: ['sales'] as const,
  list: (filters: SaleFilters) => [...saleKeys.all, 'list', filters] as const,
  detail: (id: string) => [...saleKeys.all, 'detail', id] as const,
};

export const salesApi = {
  list: (filters: SaleFilters): Promise<Page<SaleSummaryDto>> =>
    api.get('/sales', { query: { ...filters, limit: 50 } }),
  detail: (id: string): Promise<SaleDto> => api.get(`/sales/${id}`),
  createDraft: (input: CreateSaleDraftInput): Promise<SaleDto> => api.post('/sales', input),
  updateDraft: (id: string, input: UpdateSaleDraftInput): Promise<SaleDto> =>
    api.patch(`/sales/${id}`, input),
  removeDraft: (id: string): Promise<void> => api.delete(`/sales/${id}`),
  confirm: (id: string, input: ConfirmSaleInput, idempotencyKey: string): Promise<SaleDto> =>
    api.post(`/sales/${id}/confirm`, input, { idempotencyKey }),
  returnSale: (id: string, input: ReturnSaleInput, idempotencyKey: string): Promise<SaleDto> =>
    api.post(`/sales/${id}/return`, input, { idempotencyKey }),
  cancel: (id: string, input: CancelSaleInput, idempotencyKey: string): Promise<SaleDto> =>
    api.post(`/sales/${id}/cancel`, input, { idempotencyKey }),
};

export function useSales(filters: SaleFilters): UseQueryResult<Page<SaleSummaryDto>, ApiError> {
  return useQuery<Page<SaleSummaryDto>, ApiError>({
    queryKey: saleKeys.list(filters),
    queryFn: () => salesApi.list(filters),
    placeholderData: (previous) => previous,
  });
}

export function useSale(id: string): UseQueryResult<SaleDto, ApiError> {
  return useQuery<SaleDto, ApiError>({
    queryKey: saleKeys.detail(id),
    queryFn: () => salesApi.detail(id),
  });
}

export function useCreateSaleDraft(): UseMutationResult<SaleDto, ApiError, CreateSaleDraftInput> {
  const queryClient = useQueryClient();

  return useMutation<SaleDto, ApiError, CreateSaleDraftInput>({
    mutationFn: salesApi.createDraft,
    onSuccess: (sale) => {
      queryClient.setQueryData(saleKeys.detail(sale.id), sale);
      void queryClient.invalidateQueries({ queryKey: saleKeys.all });
    },
  });
}

export function useUpdateSaleDraft(
  id: string,
): UseMutationResult<SaleDto, ApiError, UpdateSaleDraftInput> {
  const queryClient = useQueryClient();

  return useMutation<SaleDto, ApiError, UpdateSaleDraftInput>({
    mutationFn: (input) => salesApi.updateDraft(id, input),
    onSuccess: (sale) => {
      // Javobdagi yangi `updatedAt` keshga tushadi — ketma-ket ikkinchi
      // saqlash eski qulf tokeni bilan ketmaydi (`API.md` §8)
      queryClient.setQueryData(saleKeys.detail(id), sale);
      void queryClient.invalidateQueries({ queryKey: saleKeys.all });
    },
  });
}

export function useDeleteSaleDraft(): UseMutationResult<void, ApiError, string> {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: salesApi.removeDraft,
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: saleKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: saleKeys.all });
    },
  });
}

/**
 * Tasdiqlash (§7, `ARCHITECTURE.md` §6).
 *
 * `Idempotency-Key` **chaqiruvchidan** keladi va forma ochilganda bir
 * marta yaratiladi (`API.md` §4.2). Bu yerda yaratilsa, har `mutate`
 * yangi kalit olardi va aynan himoya qilinishi kerak bo'lgan holat —
 * "tugma ikki marta bosildi" yoki "javob yo'qoldi, ega qaytadan bosdi" —
 * himoyasiz qolardi: ombordan yana bitta telefon yechilib ketardi.
 */
export function useConfirmSale(
  id?: string,
): UseMutationResult<
  SaleDto,
  ApiError,
  { id?: string; input: ConfirmSaleInput; idempotencyKey: string }
> {
  const queryClient = useQueryClient();

  return useMutation<
    SaleDto,
    ApiError,
    { id?: string; input: ConfirmSaleInput; idempotencyKey: string }
  >({
    mutationFn: ({ id: overrideId, input, idempotencyKey }) => {
      const targetId = overrideId || id || '';
      return salesApi.confirm(targetId, input, idempotencyKey);
    },
    onSuccess: (sale) => {
      queryClient.setQueryData(saleKeys.detail(sale.id), sale);
      void queryClient.invalidateQueries({ queryKey: saleKeys.all });
      // Bitta tranzaksiyada o'zgargan hamma narsa (§7): ombor holati,
      // mahsulot qoldig'i, kassa qoldig'i va bugungi ko'rsatkichlar
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      void queryClient.invalidateQueries({ queryKey: cashKeys.all });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      void queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}

/**
 * Qaytarish va bekor qilish (§8, §10).
 *
 * Kesh tasdiqlashdagi bilan **aynan bir xil** ro'yxat bo'yicha
 * yangilanadi va bu tasodif emas: teskari yozuv ham o'sha bitta
 * tranzaksiyada omborni, kassani va ko'rsatkichlarni o'zgartiradi.
 * Bittasi unutilsa, ega qaytarib olingan telefonni ekranda hali ham
 * "sotilgan" holida ko'rib turardi.
 *
 * `Idempotency-Key` chaqiruvchidan keladi — `useConfirmSale` dagi bilan
 * bir xil sabab: bu yerda yaratilsa, ikki marta bosilgan "Qaytarish"
 * tugmasi ombor qoldig'ini ikki barobar oshirib yuborardi.
 */
function useSaleReversal<TInput>(
  id: string,
  send: (id: string, input: TInput, idempotencyKey: string) => Promise<SaleDto>,
): UseMutationResult<SaleDto, ApiError, { input: TInput; idempotencyKey: string }> {
  const queryClient = useQueryClient();

  return useMutation<SaleDto, ApiError, { input: TInput; idempotencyKey: string }>({
    mutationFn: ({ input, idempotencyKey }) => send(id, input, idempotencyKey),
    onSuccess: (sale) => {
      queryClient.setQueryData(saleKeys.detail(id), sale);
      void queryClient.invalidateQueries({ queryKey: saleKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      void queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      void queryClient.invalidateQueries({ queryKey: cashKeys.all });
      void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      void queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}

export function useReturnSale(
  id: string,
): UseMutationResult<SaleDto, ApiError, { input: ReturnSaleInput; idempotencyKey: string }> {
  return useSaleReversal(id, salesApi.returnSale);
}

export function useCancelSale(
  id: string,
): UseMutationResult<SaleDto, ApiError, { input: CancelSaleInput; idempotencyKey: string }> {
  return useSaleReversal(id, salesApi.cancel);
}
