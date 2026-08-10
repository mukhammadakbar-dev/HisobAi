'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type {
  ExchangeRateDto,
  SyncExchangeRateResultDto,
  TodayExchangeRateDto,
  UpsertExchangeRateInput,
} from '@hisobai/contracts';

import { api } from '../../lib/api-client';
import type { ApiError } from '../../lib/api-error';

export const rateKeys = {
  all: ['exchange-rates'] as const,
  today: () => [...rateKeys.all, 'today'] as const,
  history: () => [...rateKeys.all, 'history'] as const,
};

export const ratesApi = {
  today: (): Promise<TodayExchangeRateDto> => api.get('/exchange-rates/today'),
  history: (): Promise<ExchangeRateDto[]> => api.get('/exchange-rates', { query: { limit: 30 } }),
  upsert: (date: string, input: UpsertExchangeRateInput): Promise<ExchangeRateDto> =>
    api.put(`/exchange-rates/${date}`, input),
  resetToCbu: (date: string): Promise<ExchangeRateDto> =>
    api.post(`/exchange-rates/${date}/reset-to-cbu`),
  syncNow: (): Promise<SyncExchangeRateResultDto> => api.post('/exchange-rates/sync'),
};

/** Kurs chizig'i har sahifada ko'rinadi (§14.5) — shuning uchun uzoq `staleTime`. */
export function useTodayRate(): UseQueryResult<TodayExchangeRateDto, ApiError> {
  return useQuery<TodayExchangeRateDto, ApiError>({
    queryKey: rateKeys.today(),
    queryFn: ratesApi.today,
    staleTime: 10 * 60_000,
  });
}

export function useRateHistory(): UseQueryResult<ExchangeRateDto[], ApiError> {
  return useQuery<ExchangeRateDto[], ApiError>({
    queryKey: rateKeys.history(),
    queryFn: ratesApi.history,
  });
}

export function useUpsertRate(): UseMutationResult<
  ExchangeRateDto,
  ApiError,
  { date: string; input: UpsertExchangeRateInput }
> {
  const queryClient = useQueryClient();

  return useMutation<ExchangeRateDto, ApiError, { date: string; input: UpsertExchangeRateInput }>({
    mutationFn: ({ date, input }) => ratesApi.upsert(date, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rateKeys.all }),
  });
}

/**
 * §16.8 — qo'lda qo'yilgan kursni CBU ga qaytarish.
 *
 * Bu `useUpsertRate` ning jufti: usiz `MANUAL` holatidan chiqib
 * bo'lmaydi va o'sha kun uchun avtomatik yangilanish butunlay
 * to'xtab qoladi.
 */
export function useResetRateToCbu(): UseMutationResult<ExchangeRateDto, ApiError, string> {
  const queryClient = useQueryClient();

  return useMutation<ExchangeRateDto, ApiError, string>({
    mutationFn: ratesApi.resetToCbu,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rateKeys.all }),
  });
}

/**
 * §18.4 — CBU'dan hozir yangilash (09:00 dagi cron'ni kutmasdan).
 *
 * `useResetRateToCbu` bilan chalkashtirmaslik kerak: bu **yangi qiymat
 * oladi**, u esa saqlangan qiymatdan qayta hisoblaydi.
 */
export function useSyncRateFromCbu(): UseMutationResult<SyncExchangeRateResultDto, ApiError, void> {
  const queryClient = useQueryClient();

  return useMutation<SyncExchangeRateResultDto, ApiError, void>({
    mutationFn: ratesApi.syncNow,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rateKeys.all }),
  });
}
