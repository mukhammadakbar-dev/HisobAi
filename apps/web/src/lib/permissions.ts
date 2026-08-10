import { UserRole } from '@hisobai/contracts';
import type { CurrentUserDto } from '@hisobai/contracts';

/**
 * Rolga bog'liq ko'rinish (`FRONTEND.md` §9, `PERMISSIONS.md`).
 *
 * Bu **ikkinchi qatlam**, birinchisi emas: server baribir tekshiradi
 * (default DENY guard). UI vazifasi — bosib bo'lmaydigan tugmani
 * ko'rsatmaslik.
 *
 * MVP'da faqat `OWNER` bor (§16.14), shuning uchun deyarli hamma narsa
 * `true`. Chaqiruv joylari **hozirdan** qo'yiladi: ikkinchi rol
 * qo'shilganda butun ilovani qidirib chiqish kerak bo'lmaydi.
 */
export type Action =
  | 'settings.view'
  | 'settings.editShop'
  | 'settings.editFinancial'
  | 'exchangeRate.edit'
  | 'audit.view'
  | 'session.manage';

const OWNER_ONLY: readonly Action[] = ['settings.editFinancial', 'exchangeRate.edit', 'audit.view'];

export function can(user: CurrentUserDto | undefined, action: Action): boolean {
  if (!user) return false;
  if (user.role === UserRole.OWNER) return true;
  // Kelajakdagi rollar uchun: OWNER'ga xos amallar boshqalarga yopiq
  return !OWNER_ONLY.includes(action);
}
