'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type {
  CashAccountDto,
  CashBalanceDto,
  CashCategoryDto,
  CashEntryDto,
  CreateCashAccountInput,
  CreateCashCategoryInput,
  CreateCashEntryInput,
  OpeningBalanceInput,
  Page,
  ReverseCashEntryInput,
  UpdateCashAccountInput,
  UpdateCashEntryInput,
} from '@hisobai/contracts';

import { api } from '../../lib/api-client';
import type { ApiError } from '../../lib/api-error';
import { dashboardKeys } from '../dashboard/queries';

/**
 * Kassa so'rovlari (§11).
 *
 * Qoldiq alohida so'rov (`/cashbook/balances`), hisoblar ro'yxati esa
 * alohida: forma uchun hisob nomi va valyutasi kerak, qoldiq esa yo'q.
 * Har yozuvdan keyin **qoldiq ham, dashboard ham** eskiradi — kassadagi
 * pul dashboard'ning birinchi ekranida turadi (§14.3).
 */

export interface CashEntryFilters {
  accountId?: string;
  direction?: string;
  sourceType?: string;
  categoryId?: string;
  from?: string;
  to?: string;
}

export const cashKeys = {
  all: ['cashbook'] as const,
  accounts: (includeInactive: boolean) => [...cashKeys.all, 'accounts', includeInactive] as const,
  balances: () => [...cashKeys.all, 'balances'] as const,
  categories: () => [...cashKeys.all, 'categories'] as const,
  entries: (filters: CashEntryFilters) => [...cashKeys.all, 'entries', filters] as const,
};

export const cashApi = {
  accounts: (includeInactive: boolean): Promise<CashAccountDto[]> =>
    api.get('/cash-accounts', { query: { includeInactive: includeInactive ? 'true' : undefined } }),
  balances: (): Promise<CashBalanceDto[]> => api.get('/cashbook/balances'),
  categories: (): Promise<CashCategoryDto[]> => api.get('/cash-categories'),
  entries: (filters: CashEntryFilters): Promise<Page<CashEntryDto>> =>
    api.get('/cash-entries', { query: { ...filters, limit: 50 } }),

  createAccount: (input: CreateCashAccountInput): Promise<CashAccountDto> =>
    api.post('/cash-accounts', input),
  updateAccount: (id: string, input: UpdateCashAccountInput): Promise<CashAccountDto> =>
    api.patch(`/cash-accounts/${id}`, input),
  createCategory: (input: CreateCashCategoryInput): Promise<CashCategoryDto> =>
    api.post('/cash-categories', input),

  createEntry: (input: CreateCashEntryInput, idempotencyKey: string): Promise<CashEntryDto> =>
    api.post('/cash-entries', input, { idempotencyKey }),
  updateEntry: (id: string, input: UpdateCashEntryInput): Promise<CashEntryDto> =>
    api.patch(`/cash-entries/${id}`, input),
  removeEntry: (id: string): Promise<void> => api.delete(`/cash-entries/${id}`),
  reverseEntry: (
    id: string,
    input: ReverseCashEntryInput,
    idempotencyKey: string,
  ): Promise<CashEntryDto> =>
    api.post(`/cash-entries/${id}/reverse`, input, { idempotencyKey }),
  openingBalance: (input: OpeningBalanceInput, idempotencyKey: string): Promise<CashEntryDto> =>
    api.post('/cashbook/opening-balance', input, { idempotencyKey }),
};

export function useCashAccounts(
  includeInactive = false,
): UseQueryResult<CashAccountDto[], ApiError> {
  return useQuery<CashAccountDto[], ApiError>({
    queryKey: cashKeys.accounts(includeInactive),
    queryFn: () => cashApi.accounts(includeInactive),
  });
}

export function useCashBalances(): UseQueryResult<CashBalanceDto[], ApiError> {
  return useQuery<CashBalanceDto[], ApiError>({
    queryKey: cashKeys.balances(),
    queryFn: cashApi.balances,
  });
}

export function useCashCategories(): UseQueryResult<CashCategoryDto[], ApiError> {
  return useQuery<CashCategoryDto[], ApiError>({
    queryKey: cashKeys.categories(),
    queryFn: cashApi.categories,
    // Kategoriya ro'yxati kamdan-kam o'zgaradi (§11.10)
    staleTime: 5 * 60_000,
  });
}

export function useCashEntries(
  filters: CashEntryFilters,
): UseQueryResult<Page<CashEntryDto>, ApiError> {
  return useQuery<Page<CashEntryDto>, ApiError>({
    queryKey: cashKeys.entries(filters),
    queryFn: () => cashApi.entries(filters),
    placeholderData: (previous) => previous,
  });
}

export function useCreateCashAccount(): UseMutationResult<
  CashAccountDto,
  ApiError,
  CreateCashAccountInput
> {
  const queryClient = useQueryClient();

  return useMutation<CashAccountDto, ApiError, CreateCashAccountInput>({
    mutationFn: cashApi.createAccount,
    onSuccess: () => invalidateCash(queryClient),
  });
}

export function useUpdateCashAccount(): UseMutationResult<
  CashAccountDto,
  ApiError,
  { id: string; input: UpdateCashAccountInput }
> {
  const queryClient = useQueryClient();

  return useMutation<CashAccountDto, ApiError, { id: string; input: UpdateCashAccountInput }>({
    mutationFn: ({ id, input }) => cashApi.updateAccount(id, input),
    onSuccess: () => invalidateCash(queryClient),
  });
}

export function useCreateCashCategory(): UseMutationResult<
  CashCategoryDto,
  ApiError,
  CreateCashCategoryInput
> {
  const queryClient = useQueryClient();

  return useMutation<CashCategoryDto, ApiError, CreateCashCategoryInput>({
    mutationFn: cashApi.createCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cashKeys.categories() }),
  });
}

/**
 * Qo'lda kirim/chiqim (§11.9).
 *
 * Kalit chaqiruvchidan (`API.md` §4.2): do'kondagi internet uzilganda
 * ega tugmani qayta bosadi va bitta xarajat ikki marta yozilib qolardi.
 */
export function useCreateCashEntry(): UseMutationResult<
  CashEntryDto,
  ApiError,
  { input: CreateCashEntryInput; idempotencyKey: string }
> {
  const queryClient = useQueryClient();

  return useMutation<
    CashEntryDto,
    ApiError,
    { input: CreateCashEntryInput; idempotencyKey: string }
  >({
    mutationFn: ({ input, idempotencyKey }) => cashApi.createEntry(input, idempotencyKey),
    onSuccess: () => invalidateCash(queryClient),
  });
}

/** §11.8 — faqat o'sha kuni ichida; serverdagi tekshiruv ham shu. */
export function useUpdateCashEntry(): UseMutationResult<
  CashEntryDto,
  ApiError,
  { id: string; input: UpdateCashEntryInput }
> {
  const queryClient = useQueryClient();

  return useMutation<CashEntryDto, ApiError, { id: string; input: UpdateCashEntryInput }>({
    mutationFn: ({ id, input }) => cashApi.updateEntry(id, input),
    onSuccess: () => invalidateCash(queryClient),
  });
}

export function useDeleteCashEntry(): UseMutationResult<void, ApiError, string> {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: cashApi.removeEntry,
    onSuccess: () => invalidateCash(queryClient),
  });
}

/**
 * §11.8 — ertangi kunda xato yozuvni teskari yozuv bilan tuzatish.
 *
 * `Idempotency-Key` majburiy (§17.6): bu moliyaviy `POST` va takroriy
 * yuborilishi kassani ikki marta tuzatib qo'yardi.
 */
export function useReverseCashEntry(): UseMutationResult<
  CashEntryDto,
  ApiError,
  { id: string; input: ReverseCashEntryInput; idempotencyKey: string }
> {
  const queryClient = useQueryClient();

  return useMutation<
    CashEntryDto,
    ApiError,
    { id: string; input: ReverseCashEntryInput; idempotencyKey: string }
  >({
    mutationFn: ({ id, input, idempotencyKey }) => cashApi.reverseEntry(id, input, idempotencyKey),
    onSuccess: () => invalidateCash(queryClient),
  });
}

/** §11.4 — har hisob uchun bir marta; daromad deb sanalmaydi. */
export function useOpeningBalance(): UseMutationResult<
  CashEntryDto,
  ApiError,
  { input: OpeningBalanceInput; idempotencyKey: string }
> {
  const queryClient = useQueryClient();

  return useMutation<
    CashEntryDto,
    ApiError,
    { input: OpeningBalanceInput; idempotencyKey: string }
  >({
    mutationFn: ({ input, idempotencyKey }) => cashApi.openingBalance(input, idempotencyKey),
    onSuccess: () => invalidateCash(queryClient),
  });
}

/**
 * Kassa o'zgarganda dashboard ham eskiradi.
 *
 * "Kassadagi pul" bloki dashboard'ning birinchi ekranida (§14.3):
 * yangilanmasa, ega xarajatni yozib bo'lib, boshqaruvda eski qoldiqni
 * ko'rib turardi.
 */
function invalidateCash(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: cashKeys.all });
  void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
}
