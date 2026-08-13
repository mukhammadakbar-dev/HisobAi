import { z } from 'zod';

import { AccountStatus } from '../enums';
import { pageQueryFields } from './common';
import { PASSWORD_MIN_LENGTH } from './auth';

/**
 * Platforma (SUPERADMIN) sxemalari (§21.3, §25.3–§25.6, §25.17).
 *
 * **Ataylab `auth.ts`dan alohida fayl.** `/platform/*` va `/auth/*` ikki
 * mustaqil sessiya tizimi (`ARCHITECTURE.md` §14.3): bitta fayldagi
 * umumiy sxema ikkalasini "bir xil narsa" deb ko'rsatardi va keyinchalik
 * ikkalasi turli yo'nalishda o'zgarganda import chalkashardi.
 *
 * Parol siyosati `auth.ts` dagi bilan **bir xil** (`PASSWORD_MIN_LENGTH`):
 * SUPERADMIN ham, SHOP_ADMIN ham bitta odam boshqaradigan tizimda
 * ikkita xavfsizlik darajasi ushlab turishga arzimaydi.
 */

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Parol kamida ${String(PASSWORD_MIN_LENGTH)} belgidan iborat bo'lsin`);

const email = z.string().trim().toLowerCase().email({ message: "Email noto'g'ri kiritilgan" });

export const platformLoginSchema = z
  .object({
    email,
    password: z.string().min(1, 'Parolni kiriting'),
  })
  .strict();
export type PlatformLoginInput = z.infer<typeof platformLoginSchema>;

/** `GET /platform/auth/me` javobi. Parol hash'i hech qachon chiqmaydi. */
export interface PlatformAdminDto {
  id: string;
  email: string;
  displayName: string;
}

/**
 * `POST /platform/shop-admins` — §25.5: SUPERADMIN account yaratadi,
 * Shop'ni EMAS. `shopId`, `status` kabi maydonlar shu sabab sxemada
 * YO'Q — `.strict()` ularni rad etadi, jimgina e'tiborsiz qoldirmaydi
 * (`PERMISSIONS.md` P2 bilan bir xil naqsh).
 */
export const createShopAdminSchema = z
  .object({
    email,
    password,
    displayName: z.string().trim().min(1, "Ism kiriting").max(120),
  })
  .strict();
export type CreateShopAdminInput = z.infer<typeof createShopAdminSchema>;

/**
 * `PATCH /platform/shop-admins/:id/status` (§21.6, §25.19).
 *
 * Faqat SUPERADMIN chaqiradi — `RolesGuard`da emas, `PlatformSessionGuard`
 * ostida (`@PlatformOnly()`), shuning uchun bu yerda rol tekshiruvi yo'q.
 */
export const updateShopAdminStatusSchema = z
  .object({
    status: z.enum(AccountStatus),
  })
  .strict();
export type UpdateShopAdminStatusInput = z.infer<typeof updateShopAdminStatusSchema>;

/** `GET /platform/shop-admins` — ro'yxat filtri. */
export const shopAdminQuerySchema = z.object({ ...pageQueryFields }).strict();
export type ShopAdminQuery = z.infer<typeof shopAdminQuerySchema>;

/**
 * SHOP_ADMIN account kartasi — SUPERADMIN ko'radigan yagona shakl.
 *
 * **Business ma'lumot yo'q**: `§25.3` chegarasi bo'yicha bu yerda
 * mijoz/savdo/kassa haqida hech narsa ko'rinmaydi — faqat account
 * metadata'si va `shopId` (bor-yo'qligini bildirish uchun, ichini emas).
 */
export interface ShopAdminDto {
  id: string;
  email: string;
  displayName: string;
  status: AccountStatus;
  /** §21.10 — `null` bo'lsa hali Shop yaratmagan (setup oqimida). */
  shopId: string | null;
  createdAt: string;
}
