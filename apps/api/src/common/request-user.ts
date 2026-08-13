import type { Theme, UserRole } from '@hisobai/contracts';
import type { Request } from 'express';

/**
 * Sessiyadan aniqlangan foydalanuvchi (§2.2).
 *
 * `SessionGuard` to'ldiradi, `RolesGuard` tekshiradi, audit esa `id` ni
 * har yozuvga qo'yadi. Alohida faylda turishining sababi: guard, interceptor
 * va dekorator uchun umumiy tip kerak, lekin ular bir-birini import
 * qilmasligi kerak.
 *
 * `sessionId` ham bor: `/auth/sessions` ro'yxatida "shu qurilma" ni
 * belgilash va `logout` da aynan shu sessiyani bekor qilish uchun.
 *
 * `shopId` — §21.10: SHOP_ADMIN account Shop'siz yaratiladi, shuning uchun
 * `null` bo'lishi **normal** holat, `undefined` emas. `RolesGuard`
 * `SHOP_SETUP_REQUIRED`ni shundan aniqlaydi, `ShopContextInterceptor` esa
 * shundan Prisma extension uchun Shop kontekstini ochadi (`database/shop-context.ts`).
 */
export interface RequestUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  theme: Theme;
  sessionId: string;
  shopId: string | null;
}

/**
 * `request.id` — `RequestIdMiddleware` qo'yadi; `request.user` — `SessionGuard`.
 *
 * `sessionExpired` — cookie bor edi, lekin sessiya haqiqiy emas.
 * `RolesGuard` shunga qarab "Sessiya tugadi" yoki "Tizimga kiring"
 * deb ajratadi: birinchisida foydalanuvchi nima bo'lganini tushunadi.
 */
export type AuthedRequest = Request & {
  id?: string;
  user?: RequestUser;
  sessionExpired?: boolean;
};
