'use client';

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import type {
  AuditLogDto,
  AuditQuery,
  DebtorsReportDto,
  InventoryValueDto,
  Page,
  ReportGranularity,
  ReportSeriesDto,
  ReportSummaryDto,
  TopProductsDto,
} from '@hisobai/contracts';

import { api } from '../../lib/api-client';
import type { ApiError } from '../../lib/api-error';

/**
 * Hisobotlar (§13).
 *
 * **Kesh yozilmaydi va invalidatsiya qilinmaydi.** Hisobot saqlanmaydi
 * (§13.10) va uni o'zgartiradigan mutatsiya bu yerda umuman yo'q:
 * raqamlar savdo, to'lov va kassa harakatlaridan hosil bo'ladi, ular
 * esa o'z modullarida `reportKeys` ni eskirtiradi emas — hisobot
 * sahifasi ochilganda qaytadan so'raladi.
 *
 * `staleTime` qo'yilmagan: ega hisobotni odatda bir marta ochib ko'radi
 * va o'sha payt eng yangi raqamni kutadi.
 */

/**
 * Davr (§13.9). Indeks imzosi bilan: `api.get` so'rov parametrlarini
 * `Record` sifatida kutadi va `from`/`to` to'g'ridan-to'g'ri uzatiladi.
 */
export interface Period {
  from: string;
  to: string;
  [key: string]: string;
}

export const reportKeys = {
  all: ['reports'] as const,
  summary: (period: Period) => [...reportKeys.all, 'summary', period] as const,
  series: (period: Period, granularity: ReportGranularity) =>
    [...reportKeys.all, 'series', period, granularity] as const,
  topProducts: (period: Period) => [...reportKeys.all, 'top-products', period] as const,
  inventory: () => [...reportKeys.all, 'inventory'] as const,
  debts: () => [...reportKeys.all, 'debts'] as const,
  audit: (query: AuditQuery) => ['audit-logs', query] as const,
};

export const reportsApi = {
  summary: (period: Period): Promise<ReportSummaryDto> =>
    api.get('/reports/summary', { query: period }),
  series: (period: Period, granularity: ReportGranularity): Promise<ReportSeriesDto> =>
    api.get('/reports/sales', { query: { ...period, granularity } }),
  topProducts: (period: Period): Promise<TopProductsDto> =>
    api.get('/reports/top-products', { query: { ...period, limit: 10 } }),
  inventory: (): Promise<InventoryValueDto> => api.get('/reports/inventory'),
  debts: (): Promise<DebtorsReportDto> => api.get('/reports/debts'),
  audit: (query: AuditQuery): Promise<Page<AuditLogDto>> =>
    api.get('/audit-logs', { query: { ...query, limit: 50 } }),
};

export function useReportSummary(period: Period): UseQueryResult<ReportSummaryDto, ApiError> {
  return useQuery<ReportSummaryDto, ApiError>({
    queryKey: reportKeys.summary(period),
    queryFn: () => reportsApi.summary(period),
    placeholderData: (previous) => previous,
  });
}

export function useReportSeries(
  period: Period,
  granularity: ReportGranularity,
): UseQueryResult<ReportSeriesDto, ApiError> {
  return useQuery<ReportSeriesDto, ApiError>({
    queryKey: reportKeys.series(period, granularity),
    queryFn: () => reportsApi.series(period, granularity),
    placeholderData: (previous) => previous,
  });
}

export function useTopProducts(period: Period): UseQueryResult<TopProductsDto, ApiError> {
  return useQuery<TopProductsDto, ApiError>({
    queryKey: reportKeys.topProducts(period),
    queryFn: () => reportsApi.topProducts(period),
    placeholderData: (previous) => previous,
  });
}

export function useInventoryValue(): UseQueryResult<InventoryValueDto, ApiError> {
  return useQuery<InventoryValueDto, ApiError>({
    queryKey: reportKeys.inventory(),
    queryFn: reportsApi.inventory,
  });
}

export function useDebtors(): UseQueryResult<DebtorsReportDto, ApiError> {
  return useQuery<DebtorsReportDto, ApiError>({
    queryKey: reportKeys.debts(),
    queryFn: reportsApi.debts,
  });
}

export function useAuditLogs(query: AuditQuery): UseQueryResult<Page<AuditLogDto>, ApiError> {
  return useQuery<Page<AuditLogDto>, ApiError>({
    queryKey: reportKeys.audit(query),
    queryFn: () => reportsApi.audit(query),
    placeholderData: (previous) => previous,
  });
}
