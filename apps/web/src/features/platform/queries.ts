'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type {
  CreateShopAdminInput,
  Page,
  PlatformAdminDto,
  PlatformLoginInput,
  ShopAdminDto,
  UpdateShopAdminStatusInput,
} from '@hisobai/contracts';

import type { ApiError } from '../../lib/api-error';
import { platformApi } from './api';

/**
 * Query kalitlari (`FRONTEND.md` §5.3).
 *
 * Prefiks `'platform'` — business kesh bilan **hech qachon kesishmasin**
 * (§21.3). Ikkalasi bitta `QueryClient` da yashaydi, shuning uchun
 * ajratish kalit darajasida: `queryClient.clear()` (chiqishda) ikkalasini
 * ham tozalaydi, lekin biror joyda `invalidateQueries({ queryKey: ['shops'] })`
 * platforma ro'yxatiga tegib ketmaydi.
 */
export const platformKeys = {
  all: ['platform'] as const,
  me: () => [...platformKeys.all, 'me'] as const,
  shopAdmins: () => [...platformKeys.all, 'shop-admins'] as const,
  shopAdmin: (id: string) => [...platformKeys.all, 'shop-admins', id] as const,
};

/**
 * Joriy SUPERADMIN — platforma qobig'ining darvozasi ham shu.
 *
 * `401` qayta urinilmaydi: business `useCurrentUser` bilan bir xil
 * mulohaza — sessiya yo'qligi vaqtinchalik nosozlik emas.
 */
export function usePlatformAdmin(): UseQueryResult<PlatformAdminDto, ApiError> {
  return useQuery<PlatformAdminDto, ApiError>({
    queryKey: platformKeys.me(),
    queryFn: platformApi.me,
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function usePlatformLogin(): UseMutationResult<
  PlatformAdminDto,
  ApiError,
  PlatformLoginInput
> {
  const queryClient = useQueryClient();

  return useMutation<PlatformAdminDto, ApiError, PlatformLoginInput>({
    mutationFn: platformApi.login,
    onSuccess: (admin) => {
      queryClient.setQueryData(platformKeys.me(), admin);
    },
  });
}

export function usePlatformLogout(): UseMutationResult<void, ApiError, void> {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, void>({
    mutationFn: platformApi.logout,
    onSuccess: () => {
      // Butun kesh — platforma va business birga. Bitta brauzerda ikkala
      // sessiya ochiq bo'lishi mumkin (§14.3), lekin chiqishda ehtiyotkor
      // tomon tanlanadi: ekranda qolgan eski ma'lumot bo'lmasin.
      queryClient.clear();
    },
  });
}

export function useShopAdmins(): UseQueryResult<Page<ShopAdminDto>, ApiError> {
  return useQuery<Page<ShopAdminDto>, ApiError>({
    queryKey: platformKeys.shopAdmins(),
    queryFn: () => platformApi.listShopAdmins({}),
  });
}

export function useShopAdmin(id: string): UseQueryResult<ShopAdminDto, ApiError> {
  return useQuery<ShopAdminDto, ApiError>({
    queryKey: platformKeys.shopAdmin(id),
    queryFn: () => platformApi.getShopAdmin(id),
  });
}

export function useCreateShopAdmin(): UseMutationResult<
  ShopAdminDto,
  ApiError,
  CreateShopAdminInput
> {
  const queryClient = useQueryClient();

  return useMutation<ShopAdminDto, ApiError, CreateShopAdminInput>({
    mutationFn: platformApi.createShopAdmin,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: platformKeys.shopAdmins() });
    },
  });
}

export function useUpdateShopAdminStatus(
  id: string,
): UseMutationResult<ShopAdminDto, ApiError, UpdateShopAdminStatusInput> {
  const queryClient = useQueryClient();

  return useMutation<ShopAdminDto, ApiError, UpdateShopAdminStatusInput>({
    mutationFn: (input) => platformApi.updateShopAdminStatus(id, input),
    onSuccess: (admin) => {
      queryClient.setQueryData(platformKeys.shopAdmin(id), admin);
      void queryClient.invalidateQueries({ queryKey: platformKeys.shopAdmins() });
    },
  });
}
