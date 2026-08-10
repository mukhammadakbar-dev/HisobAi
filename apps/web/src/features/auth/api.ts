import type {
  ChangePasswordInput,
  CurrentUserDto,
  ForgotPasswordInput,
  LoginAttemptDto,
  LoginInput,
  ResetPasswordInput,
  SessionDto,
} from '@hisobai/contracts';

import { api } from '../../lib/api-client';

/**
 * Auth so'rovlari (`FRONTEND.md` §3 — `features/<domen>/api.ts`).
 *
 * Bu qatlam faqat HTTP: kesh, holat va invalidatsiya `queries.ts` da.
 * Ajratilishining sababi — so'rovni testda mock qilish oson bo'lsin.
 */
export const authApi = {
  me: (): Promise<CurrentUserDto> => api.get('/auth/me'),

  login: (input: LoginInput): Promise<CurrentUserDto> => api.post('/auth/login', input),

  logout: (): Promise<void> => api.post('/auth/logout'),

  sessions: (): Promise<SessionDto[]> => api.get('/auth/sessions'),

  revokeSession: (id: string): Promise<void> => api.delete(`/auth/sessions/${id}`),

  revokeOtherSessions: (): Promise<{ revoked: number }> => api.delete('/auth/sessions'),

  changePassword: (input: ChangePasswordInput): Promise<void> =>
    api.post('/auth/change-password', input),

  /**
   * Javob har doim `204` — email bazada bor-yo'qligidan qat'i nazar
   * (`auth.service.ts`). UI ham shuni takrorlaydi: "xat yuborildi" degan
   * matn hisob mavjudligini oshkor qilmaydi.
   */
  forgotPassword: (input: ForgotPasswordInput): Promise<void> =>
    api.post('/auth/forgot-password', input),

  resetPassword: (input: ResetPasswordInput): Promise<void> =>
    api.post('/auth/reset-password', input),

  loginAttempts: (limit = 20): Promise<LoginAttemptDto[]> =>
    api.get('/auth/login-attempts', { query: { limit } }),
};
