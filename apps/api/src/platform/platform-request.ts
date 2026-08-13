import type { Request } from 'express';

/**
 * `PlatformSessionGuard` to'ldiradigan platforma foydalanuvchisi
 * (§21.3, `ARCHITECTURE.md` §14.3).
 *
 * `RequestUser` (`common/request-user.ts`) bilan **ataylab bir xil shakl
 * emas**: bu yerda `role` yo'q (SUPERADMIN'da rol tushunchasi yo'q — u
 * `UserRole` enum'ida umuman qatnashmaydi, `PERMISSIONS.md` §5) va
 * `shopId` HAM yo'q — maydonning o'zi yo'qligi (`null` emas) §21.3
 * invariantini tip darajasida ifodalaydi: shop-scoped hech qanday kod
 * bu obyektdan `shopId` o'qiy olmaydi, chunki u yo'q.
 */
export interface PlatformAdminAuth {
  id: string;
  email: string;
  displayName: string;
  sessionId: string;
}

/**
 * `request.platformAdmin` — `request.user`dan ALOHIDA maydon (bir xil
 * emas). Ikkalasi bir vaqtda to'ldirilishi MUMKIN (masalan business
 * cookie'si ham, platforma cookie'si ham brauzerda bo'lsa) — ular
 * mustaqil sessiya tizimlari, biri ikkinchisini bekor qilmaydi.
 */
export type AuthedPlatformRequest = Request & {
  platformAdmin?: PlatformAdminAuth;
  platformSessionExpired?: boolean;
};
