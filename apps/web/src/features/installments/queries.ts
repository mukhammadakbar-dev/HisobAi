'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type {
  CloseContractInput,
  CreatePaymentInput,
  DocumentGenerateDto,
  DocumentVersionDto,
  InstallmentContractDto,
  InstallmentListResponse,
  Page,
  PaymentDto,
  RebuildScheduleInput,
  RejectPaymentInput,
  ReversePaymentInput,
} from '@hisobai/contracts';

import { api } from '../../lib/api-client';
import type { ApiError } from '../../lib/api-error';
import { cashKeys } from '../cashbook/queries';
import { customerKeys } from '../customers/queries';
import { dashboardKeys } from '../dashboard/queries';
import { saleKeys } from '../sales/queries';

/**
 * Nasiya va to'lovlar (§9, §10).
 *
 * Har bir pul harakati **bir nechta ekranni** eskirtiradi: shartnoma
 * kartasi (qarz qoldig'i), qarzdorlar ro'yxati, kassa qoldig'i, mijoz
 * kartasi va dashboard. Bittasi unutilsa, ega to'lovni qabul qilib,
 * kassada eski qoldiqni ko'rib turaveradi — savdo tasdiqlashdagi bilan
 * bir xil sabab.
 */

export interface InstallmentFilters {
  status?: string;
  customerId?: string;
  overdue?: 'true' | 'false';
}

export const installmentKeys = {
  all: ['installments'] as const,
  list: (filters: InstallmentFilters) => [...installmentKeys.all, 'list', filters] as const,
  detail: (id: string) => [...installmentKeys.all, 'detail', id] as const,
};

export const paymentKeys = {
  all: ['payments'] as const,
  list: (contractId: string) => [...paymentKeys.all, 'list', contractId] as const,
};

export const documentKeys = {
  all: ['documents'] as const,
  list: (contractId: string) => [...documentKeys.all, 'list', contractId] as const,
};

export const installmentsApi = {
  list: (filters: InstallmentFilters): Promise<InstallmentListResponse> =>
    api.get('/installments', { query: { ...filters, limit: 50 } }),
  detail: (id: string): Promise<InstallmentContractDto> => api.get(`/installments/${id}`),
  rebuildSchedule: (
    id: string,
    input: RebuildScheduleInput,
    idempotencyKey: string,
  ): Promise<InstallmentContractDto> =>
    api.patch(`/installments/${id}/schedule`, input, { idempotencyKey }),
  close: (id: string, input: CloseContractInput, idempotencyKey: string): Promise<PaymentDto> =>
    api.post(`/installments/${id}/close`, input, { idempotencyKey }),
};

export const paymentsApi = {
  list: (contractId: string): Promise<Page<PaymentDto>> =>
    api.get('/payments', { query: { contractId, limit: 50 } }),
  create: (input: CreatePaymentInput, idempotencyKey: string): Promise<PaymentDto> =>
    api.post('/payments', input, { idempotencyKey }),
  confirm: (id: string, idempotencyKey: string): Promise<PaymentDto> =>
    api.post(`/payments/${id}/confirm`, {}, { idempotencyKey }),
  reject: (id: string, input: RejectPaymentInput, idempotencyKey: string): Promise<PaymentDto> =>
    api.post(`/payments/${id}/reject`, input, { idempotencyKey }),
  reverse: (id: string, input: ReversePaymentInput, idempotencyKey: string): Promise<PaymentDto> =>
    api.post(`/payments/${id}/reverse`, input, { idempotencyKey }),
};

export const documentsApi = {
  generate: (contractId: string): Promise<DocumentGenerateDto> =>
    api.post(`/documents/contracts/${contractId}/pdf`),
  list: (contractId: string): Promise<DocumentVersionDto[]> =>
    api.get(`/documents/contracts/${contractId}`),
};

export function useInstallments(
  filters: InstallmentFilters,
): UseQueryResult<InstallmentListResponse, ApiError> {
  return useQuery<InstallmentListResponse, ApiError>({
    queryKey: installmentKeys.list(filters),
    queryFn: () => installmentsApi.list(filters),
    placeholderData: (previous) => previous,
  });
}

export function useInstallment(id: string): UseQueryResult<InstallmentContractDto, ApiError> {
  return useQuery<InstallmentContractDto, ApiError>({
    queryKey: installmentKeys.detail(id),
    queryFn: () => installmentsApi.detail(id),
  });
}

export function useContractPayments(
  contractId: string,
): UseQueryResult<Page<PaymentDto>, ApiError> {
  return useQuery<Page<PaymentDto>, ApiError>({
    queryKey: paymentKeys.list(contractId),
    queryFn: () => paymentsApi.list(contractId),
  });
}

export function useContractDocuments(
  contractId: string,
): UseQueryResult<DocumentVersionDto[], ApiError> {
  return useQuery<DocumentVersionDto[], ApiError>({
    queryKey: documentKeys.list(contractId),
    queryFn: () => documentsApi.list(contractId),
  });
}

/**
 * Pul harakatidan keyin eskiradigan hamma narsa.
 *
 * Alohida funksiya, chunki uni beshta mutatsiya chaqiradi va ro'yxatni
 * har birida qaytadan yozish — bittasini unutish uchun eng qulay
 * yo'l.
 */
function invalidateMoney(queryClient: ReturnType<typeof useQueryClient>, contractId: string): void {
  void queryClient.invalidateQueries({ queryKey: installmentKeys.detail(contractId) });
  void queryClient.invalidateQueries({ queryKey: installmentKeys.all });
  void queryClient.invalidateQueries({ queryKey: paymentKeys.all });
  void queryClient.invalidateQueries({ queryKey: cashKeys.all });
  void queryClient.invalidateQueries({ queryKey: customerKeys.all });
  void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
  void queryClient.invalidateQueries({ queryKey: saleKeys.all });
}

export function useCreatePayment(
  contractId: string,
): UseMutationResult<PaymentDto, ApiError, { input: CreatePaymentInput; idempotencyKey: string }> {
  const queryClient = useQueryClient();

  return useMutation<PaymentDto, ApiError, { input: CreatePaymentInput; idempotencyKey: string }>({
    mutationFn: ({ input, idempotencyKey }) => paymentsApi.create(input, idempotencyKey),
    onSuccess: () => {
      invalidateMoney(queryClient, contractId);
    },
  });
}

/**
 * O'tkazmani hal qilish: tasdiqlash, rad etish yoki qaytarish (§12).
 *
 * Uchalasi bitta hook orqali, chunki ular bir xil keshni eskirtiradi va
 * bir xil `Idempotency-Key` qoidasiga bo'ysunadi. Farqi faqat qaysi
 * endpoint chaqirilishida.
 */
export function usePaymentAction(
  contractId: string,
): UseMutationResult<
  PaymentDto,
  ApiError,
  { id: string; action: 'confirm' | 'reject' | 'reverse'; reason?: string; idempotencyKey: string }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, action, reason, idempotencyKey }) => {
      if (action === 'confirm') return paymentsApi.confirm(id, idempotencyKey);
      if (action === 'reject')
        return paymentsApi.reject(id, { reason: reason ?? '' }, idempotencyKey);
      return paymentsApi.reverse(id, { reason: reason ?? '' }, idempotencyKey);
    },
    onSuccess: () => {
      invalidateMoney(queryClient, contractId);
    },
  });
}

export function useRebuildSchedule(
  id: string,
): UseMutationResult<
  InstallmentContractDto,
  ApiError,
  { input: RebuildScheduleInput; idempotencyKey: string }
> {
  const queryClient = useQueryClient();

  return useMutation<
    InstallmentContractDto,
    ApiError,
    { input: RebuildScheduleInput; idempotencyKey: string }
  >({
    mutationFn: ({ input, idempotencyKey }) =>
      installmentsApi.rebuildSchedule(id, input, idempotencyKey),
    onSuccess: (contract) => {
      queryClient.setQueryData(installmentKeys.detail(id), contract);
      void queryClient.invalidateQueries({ queryKey: installmentKeys.all });
    },
  });
}

export function useCloseContract(
  id: string,
): UseMutationResult<PaymentDto, ApiError, { input: CloseContractInput; idempotencyKey: string }> {
  const queryClient = useQueryClient();

  return useMutation<PaymentDto, ApiError, { input: CloseContractInput; idempotencyKey: string }>({
    mutationFn: ({ input, idempotencyKey }) => installmentsApi.close(id, input, idempotencyKey),
    onSuccess: () => {
      invalidateMoney(queryClient, id);
    },
  });
}

/**
 * Nasiya shartnomasi PDF'ini yaratish (§15.2, §16.10).
 *
 * Muvaffaqiyatli bo'lganda hujjatlar ro'yxati va shartnoma keshini yangilaydi.
 * `Idempotency-Key` shart emas: backend o'zi sha256 bo'yicha dedup qiladi (§15.2).
 */
export function useGenerateContractPdf(
  contractId: string,
): UseMutationResult<DocumentGenerateDto, ApiError, void> {
  const queryClient = useQueryClient();

  return useMutation<DocumentGenerateDto, ApiError, void>({
    mutationFn: () => documentsApi.generate(contractId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentKeys.all });
      void queryClient.invalidateQueries({ queryKey: installmentKeys.detail(contractId) });
      void queryClient.invalidateQueries({ queryKey: installmentKeys.all });
    },
  });
}
