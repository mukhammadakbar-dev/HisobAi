'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type {
  ChangePasswordInput,
  CurrentUserDto,
  ForgotPasswordInput,
  LoginAttemptDto,
  LoginInput,
  ResetPasswordInput,
  SessionDto,
} from '@hisobai/contracts';

import type { ApiError } from '../../lib/api-error';
import { authApi } from './api';

/** Query kalitlari (`FRONTEND.md` §5.3). */
export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
  sessions: () => [...authKeys.all, 'sessions'] as const,
  loginAttempts: () => [...authKeys.all, 'login-attempts'] as const,
};

/**
 * Joriy foydalanuvchi — auth darvozasi ham shu.
 *
 * `401` qayta urinilmaydi: sessiya yo'qligi vaqtinchalik nosozlik emas,
 * uni takrorlash faqat kechikish qo'shadi.
 */
export function useCurrentUser(): UseQueryResult<CurrentUserDto, ApiError> {
  return useQuery<CurrentUserDto, ApiError>({
    queryKey: authKeys.me(),
    queryFn: authApi.me,
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useLogin(): UseMutationResult<CurrentUserDto, ApiError, LoginInput> {
  const queryClient = useQueryClient();

  return useMutation<CurrentUserDto, ApiError, LoginInput>({
    mutationFn: authApi.login,
    onSuccess: (user) => {
      // Javobni keshga darhol qo'yamiz — `/dashboard` qayta so'ramasin
      queryClient.setQueryData(authKeys.me(), user);
    },
  });
}

export function useLogout(): UseMutationResult<void, ApiError, void> {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, void>({
    mutationFn: authApi.logout,
    onSuccess: () => {
      // Butun kesh tozalanadi: chiqqandan keyin ekranda eski ma'lumot qolmasin
      queryClient.clear();
    },
  });
}

export function useSessions(): UseQueryResult<SessionDto[], ApiError> {
  return useQuery<SessionDto[], ApiError>({
    queryKey: authKeys.sessions(),
    queryFn: authApi.sessions,
  });
}

export function useRevokeSession(): UseMutationResult<void, ApiError, string> {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: authApi.revokeSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.sessions() }),
  });
}

export function useRevokeOtherSessions(): UseMutationResult<{ revoked: number }, ApiError, void> {
  const queryClient = useQueryClient();

  return useMutation<{ revoked: number }, ApiError, void>({
    mutationFn: authApi.revokeOtherSessions,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.sessions() }),
  });
}

export function useChangePassword(): UseMutationResult<void, ApiError, ChangePasswordInput> {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, ChangePasswordInput>({
    mutationFn: authApi.changePassword,
    onSuccess: () => {
      // Parol o'zgargach boshqa sessiyalar serverda bekor qilinadi (§2.7)
      void queryClient.invalidateQueries({ queryKey: authKeys.sessions() });
    },
  });
}

export function useForgotPassword(): UseMutationResult<void, ApiError, ForgotPasswordInput> {
  return useMutation<void, ApiError, ForgotPasswordInput>({
    mutationFn: authApi.forgotPassword,
  });
}

/**
 * Parol tiklangach **barcha** sessiyalar bekor qilinadi (`auth.service.ts`),
 * shuning uchun keshni tozalaymiz: ekranda oldingi hisobning ma'lumoti
 * qolib ketmasin.
 */
export function useResetPassword(): UseMutationResult<void, ApiError, ResetPasswordInput> {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, ResetPasswordInput>({
    mutationFn: authApi.resetPassword,
    onSuccess: () => {
      queryClient.clear();
    },
  });
}

export function useLoginAttempts(): UseQueryResult<LoginAttemptDto[], ApiError> {
  return useQuery<LoginAttemptDto[], ApiError>({
    queryKey: authKeys.loginAttempts(),
    queryFn: () => authApi.loginAttempts(),
  });
}
