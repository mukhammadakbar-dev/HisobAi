'use client';

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type { DashboardDto } from '@hisobai/contracts';

import { api } from '../../lib/api-client';
import type { ApiError } from '../../lib/api-error';

export const dashboardKeys = {
  all: ['dashboard'] as const,
  today: () => [...dashboardKeys.all, 'today'] as const,
};

export const dashboardApi = {
  today: (): Promise<DashboardDto> => api.get('/dashboard'),
};

/**
 * Dashboard ma'lumoti — **bitta so'rov** (§14.1).
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
export function useDashboard(): UseQueryResult<DashboardDto, ApiError> {
  return useQuery<DashboardDto, ApiError>({
    queryKey: dashboardKeys.today(),
    queryFn: dashboardApi.today,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
