'use client';

import { normalizePhone } from '@hisobai/contracts';
import type {
  CreateCustomerInput,
  CustomerDto,
  CustomerListResponse,
  CustomerSummaryDto,
  Page,
  UpdateCustomerInput,
} from '@hisobai/contracts';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  UseInfiniteQueryResult,
  UseMutationResult,
  UseQueryResult,
} from '@tanstack/react-query';

import { api } from '../../lib/api-client';
import type { ApiError } from '../../lib/api-error';

/**
 * Mijoz so'rovlari (§6).
 *
 * Qarz `CustomerSummaryDto.outstandingDebt`/`debtStatus` orqali keladi
 * (§6.12, §9.8 kengaytma) — server tranzaksiyalardan hisoblaydi,
 * client hech qanday arifmetika qilmaydi.
 */

export interface CustomerFilters {
  q?: string;
  isActive?: 'active' | 'archived' | 'all';
  isFlagged?: 'true';
  /** §6.12 kengaytma — "Qarzi bor" chipi. */
  hasDebt?: 'true';
}

export const customerKeys = {
  all: ['customers'] as const,
  list: (filters: CustomerFilters) => [...customerKeys.all, 'list', filters] as const,
  infiniteList: (filters: CustomerFilters) =>
    [...customerKeys.all, 'infinite-list', filters] as const,
  detail: (id: string) => [...customerKeys.all, 'detail', id] as const,
  duplicate: (phone: string) => [...customerKeys.all, 'duplicate', phone] as const,
};

export const customersApi = {
  list: (filters: CustomerFilters, cursor?: string): Promise<CustomerListResponse> =>
    api.get('/customers', { query: { ...filters, cursor, limit: 50 } }),
  detail: (id: string): Promise<CustomerDto> => api.get(`/customers/${id}`),
  create: (input: CreateCustomerInput): Promise<CustomerDto> => api.post('/customers', input),
  update: (id: string, input: UpdateCustomerInput): Promise<CustomerDto> =>
    api.patch(`/customers/${id}`, input),
};

export function useCustomers(
  filters: CustomerFilters,
): UseQueryResult<CustomerListResponse, ApiError> {
  return useQuery<CustomerListResponse, ApiError>({
    queryKey: customerKeys.list(filters),
    queryFn: () => customersApi.list(filters),
    // Filtr o'zgarganda eski ro'yxat ko'rinib tursin — jadval sakramaydi
    placeholderData: (previous) => previous,
  });
}

/**
 * Ro'yxat sahifasi uchun — kursor bilan "Yana yuklash" (§6.4).
 *
 * `totalCount`/`totalDebt` har bir sahifada bir xil qaytadi (butun
 * filtrlangan to'plam bo'yicha), shuning uchun banner uchun birinchi
 * sahifa yetarli.
 */
export function useCustomersInfinite(
  filters: CustomerFilters,
): UseInfiniteQueryResult<CustomerListResponse[], ApiError> {
  return useInfiniteQuery<CustomerListResponse, ApiError, CustomerListResponse[]>({
    queryKey: customerKeys.infiniteList(filters),
    queryFn: ({ pageParam }) => customersApi.list(filters, pageParam as string | undefined),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    select: (data) => data.pages,
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
