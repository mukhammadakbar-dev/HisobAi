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
  | 'session.manage'
  | 'catalog.view'
  | 'catalog.edit'
  | 'inventory.view'
  | 'inventory.receive'
  | 'customer.view'
  | 'customer.edit'
  /** `PERMISSIONS.md` §2 — arxivlash va belgilash `SELLER` ga yopiq. */
  | 'customer.archive'
  /** §6.5, §6.7 — passport ma'lumoti. */
  | 'passport.view'
  /** `PERMISSIONS.md` P7 — `SELLER` tannarxni ko'rmaydi. */
  | 'cost.view'
  /** `PERMISSIONS.md` §2 — kassa qoldiqlari `SELLER` ga yopiq (dashboard bloki ham). */
  | 'cashbook.view';

/**
 * `OWNER` dan boshqa rollarga **yopiq** amallar (`PERMISSIONS.md` §2).
 *
 * Ro'yxat matritsadagi ❌ larni qamraydi va yangi amal qo'shilganda shu
 * yerga ham tushishi kerak: unutilsa, amal jimgina **ochiq** bo'lib
 * qoladi. Aynan shuning uchun tanlov fail-closed — `MANAGER` ba'zilarini
 * (masalan `cost.view`, `catalog.edit`) ko'radi, lekin u rol hali
 * `UserRole` da yo'q. Rol qo'shilganda bu ro'yxat rol bo'yicha
 * ajratiladi; hozir ortiqcha to'sish tannarx sizishidan xavfsizroq (P7).
 */
const RESTRICTED: readonly Action[] = [
  'settings.editFinancial',
  'exchangeRate.edit',
  'audit.view',
  'catalog.edit',
  'inventory.receive',
  'cost.view',
  'cashbook.view',
  'customer.archive',
  'passport.view',
];

export function can(user: CurrentUserDto | undefined, action: Action): boolean {
  if (!user) return false;
  if (user.role === UserRole.SHOP_ADMIN) return true;
  return !RESTRICTED.includes(action);
}
