import type {
  CreateShopAdminInput,
  Page,
  PlatformAdminDto,
  PlatformLoginInput,
  ShopAdminDto,
  ShopAdminQuery,
  UpdateShopAdminStatusInput,
} from '@hisobai/contracts';

import { api } from '../../lib/api-client';

/**
 * Platforma (SUPERADMIN) API yuzasi — §25.4, `ARCHITECTURE.md` §14.3.
 *
 * **Transport `lib/api-client` bilan umumiy, yuza esa ajratilgan.**
 * `ARCHITECTURE.md` §14.7 "o'z API klienti" deydi; amalda ajratilishi
 * kerak bo'lgan narsa — **sessiya va holat**, transport emas:
 *
 *  - sessiyani brauzer cookie'si hal qiladi va ular allaqachon alohida
 *    (`hisobai_platform_session` va `hisobai_session`, §14.3) — bir xil
 *    `fetch` ikkalasini ham to'g'ri olib yuradi;
 *  - React Query kalitlari bu yerda `['platform', …]` prefiksi bilan,
 *    ya'ni business kesh bilan hech qachon kesishmaydi;
 *  - `401` qaytish nuqtasi manzil bo'yicha ajratilgan (`providers.tsx`).
 *
 * Transportni nusxalash esa CSRF olish (`ensureCsrfToken`), xato
 * shakllantirish va `Idempotency-Key` mantig'ini ikkilantirardi — ular
 * vaqt o'tib bir-biridan uzoqlashib, bittasida xatolik tuzatilib
 * ikkinchisida qolib ketardi. Bu §14.7 dan ongli chekinish.
 */
export const platformApi = {
  login: (input: PlatformLoginInput): Promise<PlatformAdminDto> =>
    api.post('/platform/auth/login', input),

  logout: (): Promise<void> => api.post('/platform/auth/logout'),

  me: (): Promise<PlatformAdminDto> => api.get('/platform/auth/me'),

  listShopAdmins: (query: ShopAdminQuery): Promise<Page<ShopAdminDto>> =>
    api.get('/platform/shop-admins', { query }),

  getShopAdmin: (id: string): Promise<ShopAdminDto> => api.get(`/platform/shop-admins/${id}`),

  createShopAdmin: (input: CreateShopAdminInput): Promise<ShopAdminDto> =>
    api.post('/platform/shop-admins', input),

  updateShopAdminStatus: (id: string, input: UpdateShopAdminStatusInput): Promise<ShopAdminDto> =>
    api.patch(`/platform/shop-admins/${id}/status`, input),
};
