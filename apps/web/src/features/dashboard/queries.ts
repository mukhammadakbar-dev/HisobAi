'use client';

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { DashboardDto, DashboardPeriod } from '@hisobai/contracts';

import { api } from '../../lib/api-client';
import type { ApiError } from '../../lib/api-error';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  byPeriod: (period: DashboardPeriod) => [...dashboardKeys.all, period] as const,
};

export const dashboardApi = {
  get: (period: DashboardPeriod): Promise<DashboardDto> =>
    api.get('/dashboard', { query: { period } }),
};

/**
 * Dashboard ma'lumoti — **bitta so'rov** (§14.1), davr bo'yicha
 * (`DashboardPeriod` kengaytmasi — `today`/`week`/`month`).
 *
 * §14.7: avtomatik yangilanish yo'q. Global konfiguratsiya
 * `refetchOnWindowFocus` ni allaqachon o'chirgan (`query-client.ts`),
 * bu yerda `refetchInterval` ham qo'yilmaydi — do'konda telefon kun
 * bo'yi ochiq turadi va har daqiqadagi so'rov trafik bilan batareyani
 * yeydi.
 *
 * `staleTime: 0` va `refetchOnMount: 'always'` esa qolgan yarmi:
 * yangilanish **sahifa ochilganda** bo'lishi kerak, keshdan eski
 * raqamni ko'rsatib qo'yish esa savdo raqamida yo'l qo'yib
 * bo'lmaydigan xato.
 */
export function useDashboard(period: DashboardPeriod): UseQueryResult<DashboardDto, ApiError> {
  return useQuery<DashboardDto, ApiError>({
    queryKey: dashboardKeys.byPeriod(period),
    queryFn: () => dashboardApi.get(period),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
