'use client';

import { normalizePhone } from '@hisobai/contracts';
import type {
  CreateCustomerInput,
  CustomerDto,
  CustomerHistoryItemDto,
  CustomerSummaryDto,
  Page,
  UpdateCustomerInput,
} from '@hisobai/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import { api } from '../../lib/api-client';
import type { ApiError } from '../../lib/api-error';

/**
 * Mijoz so'rovlari (§6).
 *
 * Qarz uchun alohida so'rov YO'Q va bo'lmaydi: u `CustomerDto` ichida
 * keladi (§6.11). Alohida endpoint bo'lsa ro'yxatdagi har qator uchun
 * bitta so'rov ketardi; server esa sahifadagi hamma mijoz uchun uni
 * bitta so'rovda hisoblaydi (`customers.service.ts` — `debtByCustomer`).
 */

export interface CustomerFilters {
  q?: string;
  isActive?: 'active' | 'archived' | 'all';
  isFlagged?: 'true';
}

export const customerKeys = {
  all: ['customers'] as const,
  list: (filters: CustomerFilters) => [...customerKeys.all, 'list', filters] as const,
  detail: (id: string) => [...customerKeys.all, 'detail', id] as const,
  duplicate: (phone: string) => [...customerKeys.all, 'duplicate', phone] as const,
  history: (id: string) => [...customerKeys.all, 'history', id] as const,
};

export const customersApi = {
  list: (filters: CustomerFilters): Promise<Page<CustomerSummaryDto>> =>
    api.get('/customers', { query: { ...filters, limit: 50 } }),
  detail: (id: string): Promise<CustomerDto> => api.get(`/customers/${id}`),
  history: (id: string): Promise<Page<CustomerHistoryItemDto>> =>
    api.get(`/customers/${id}/history`),
  create: (input: CreateCustomerInput): Promise<CustomerDto> => api.post('/customers', input),
  update: (id: string, input: UpdateCustomerInput): Promise<CustomerDto> =>
    api.patch(`/customers/${id}`, input),
};

export function useCustomers(
  filters: CustomerFilters,
): UseQueryResult<Page<CustomerSummaryDto>, ApiError> {
  return useQuery<Page<CustomerSummaryDto>, ApiError>({
    queryKey: customerKeys.list(filters),
    queryFn: () => customersApi.list(filters),
    // Filtr o'zgarganda eski ro'yxat ko'rinib tursin — jadval sakramaydi
    placeholderData: (previous) => previous,
  });
}

export function useCustomer(id: string): UseQueryResult<CustomerDto, ApiError> {
  return useQuery<CustomerDto, ApiError>({
    queryKey: customerKeys.detail(id),
    queryFn: () => customersApi.detail(id),
  });
}

/**
 * §6.3 — "Bu raqam Alisher Karimovda bor. O'shami?"
 *
 * Tekshiruv **yuborishdan oldin** ishlaydi: forma to'ldirilib bo'lgach
 * `409` olish — eng qimmat variant, chunki ega ismni, manzilni va
 * passportni allaqachon terib bo'lgan bo'ladi.
 *
 * Qidiruv raqamlar bo'yicha ketadi (server ajratgichlarni o'zi
 * tozalaydi), lekin taqqoslash **normallashtirilgan** qiymat bilan:
 * `q` qisman moslikni ham qaytaradi, bizga esa aynan o'sha raqam
 * kerak.
 */
export function useDuplicateCustomer(rawPhone: string): CustomerSummaryDto | null {
  const normalized = normalizePhone(rawPhone);

  const query = useQuery<Page<CustomerSummaryDto>, ApiError>({
    queryKey: customerKeys.duplicate(normalized ?? ''),
    queryFn: () => customersApi.list({ q: normalized ?? '', isActive: 'all' }),
    enabled: normalized !== null,
    // Bir xil raqam uchun qayta so'ralmasin — foydalanuvchi maydonga
    // qaytib kelsa ham javob keshda turadi
    staleTime: 60_000,
  });

  if (!normalized) return null;
  return query.data?.data.find((customer) => customer.phonePrimary === normalized) ?? null;
}

export function useCreateCustomer(): UseMutationResult<CustomerDto, ApiError, CreateCustomerInput> {
  const queryClient = useQueryClient();

  return useMutation<CustomerDto, ApiError, CreateCustomerInput>({
    mutationFn: customersApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: customerKeys.all }),
  });
}

export function useUpdateCustomer(
  id: string,
): UseMutationResult<CustomerDto, ApiError, UpdateCustomerInput> {
  const queryClient = useQueryClient();

  return useMutation<CustomerDto, ApiError, UpdateCustomerInput>({
    mutationFn: (input) => customersApi.update(id, input),
    onSuccess: (customer) => {
      // Javobdagi yangi `updatedAt` keshga tushadi — ketma-ket ikkinchi
      // saqlash eski qulf tokeni bilan ketmaydi (`API.md` §8)
      queryClient.setQueryData(customerKeys.detail(id), customer);
      void queryClient.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}

/**
 * §6 — mijoz tarixi: savdo va nasiya to'lovlari bitta xronologik oqimda
 * (`DECISIONS.md` §25.2).
 *
 * Kalit `customerKeys.all` ostida: to'lov qilinganda nasiya moduli
 * `customerKeys.all` ni eskirtiradi (`installments/queries.ts`), ya'ni
 * tarix ham qarz bilan birga yangilanadi va alohida ulanish kerak emas.
 */
export function useCustomerHistory(
  id: string,
): UseQueryResult<Page<CustomerHistoryItemDto>, ApiError> {
  return useQuery({
    queryKey: customerKeys.history(id),
    queryFn: () => customersApi.history(id),
  });
}
