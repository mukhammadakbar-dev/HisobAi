import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@hisobai/contracts';

export const PUBLIC_KEY = 'hisobai:public';
export const ROLES_KEY = 'hisobai:roles';
export const IDEMPOTENT_KEY = 'hisobai:idempotent';
export const SHOP_EXEMPT_KEY = 'hisobai:shop-exempt';
export const PLATFORM_ONLY_KEY = 'hisobai:platform-only';

/**
 * Autentifikatsiyasiz ochiq endpoint (`PERMISSIONS.md` §1).
 *
 * Ro'yxat qisqa va ataylab qisqa: `/auth/login`, `/auth/forgot-password`,
 * `/auth/reset-password`, `/health/*`. Yangisini qo'shishdan oldin
 * `PERMISSIONS.md` yangilanadi.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_KEY, true);

/**
 * Endpointga kira oladigan rollar.
 *
 * **Default DENY:** `@Roles()` ham, `@Public()` ham qo'yilmagan endpoint
 * hech kimga ochilmaydi (`RolesGuard`). Sabab: unutilgan dekorator
 * endpointni jimgina hammaga ochib qo'ymasin.
 *
 * MVP'da faqat `OWNER` mavjud (§16.14), lekin chaqiruv joylari hozirdan
 * qo'yiladi — keyin rol qo'shilganda qidirib yurish kerak bo'lmaydi.
 */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

/**
 * Takroriy so'rovdan himoyalangan endpoint (§17.6, `API.md` §4).
 *
 * Barcha moliyaviy `POST`/`PATCH` amallarida majburiy: savdo tasdiqlash,
 * to'lov, qaytarish, kassa yozuvi, ombor qabul qilish.
 */
export const Idempotent = (): MethodDecorator => SetMetadata(IDEMPOTENT_KEY, true);

/**
 * Shop konteksti talab qilinmaydigan `@Roles(...)` endpoint (§14.8, §21.10).
 *
 * **Default: teskari.** `RolesGuard`dan o'tgan har bir endpoint — Shop
 * tuzilmasidan keyin ishlashi kerak bo'lgan biznes endpoint deb hisoblanadi;
 * Shop'siz account kirsa `SHOP_SETUP_REQUIRED` (409) qaytadi. Bu dekorator
 * shundan chiqarib tashlaydi.
 *
 * Ro'yxat qisqa va ataylab qisqa: faqat hisob darajasidagi amallar
 * (`/auth/me`, sessiyalar, parol) — ular Shop hali yo'q bo'lsa ham ishlashi
 * SHART, aks holda foydalanuvchi `/app/setup-shop`ga yetib bora olmasdi
 * (masalan chiqib keta olmasdi yoki parolini eslay olmasdi).
 */
export const ShopExempt = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SHOP_EXEMPT_KEY, true);

/**
 * Platforma (SUPERADMIN) endpointi (§21.3, `ARCHITECTURE.md` §14.3,
 * `PERMISSIONS.md` §5).
 *
 * **`@Roles(...)` bilan bitta endpointda hech qachon ishlatilmaydi** —
 * ular ikki mustaqil kirish tizimini ifodalaydi (business `SessionGuard`
 * + `RolesGuard` va platforma `PlatformSessionGuard`). Bu qoida reviewer
 * diqqatiga emas, `roles.guard.spec.ts` dagi struktura testiga tayanadi:
 * u har bir kontroller metodini skanerlab, ikkalasi BIRGA
 * qo'yilmaganini tasdiqlaydi — Nest metadata darajasida ikkalasini bitta
 * dekoratordan qilib bo'lmaydi (`SetMetadata` mustaqil kalitlar bilan
 * ishlaydi), shuning uchun kafolat testda.
 *
 * `RolesGuard` bu belgini ko'rsa business yo'lni butunlay chetlab o'tadi
 * (`SHOP_SETUP_REQUIRED` tekshiruvi ham, rol tekshiruvi ham) — qaror
 * allaqachon `PlatformSessionGuard`da qabul qilingan (u RAD ETADI, faqat
 * ANIQLAMAYDI, `SessionGuard`dan farqli — platforma yo'lida bu ikkinchi
 * qatlam yo'q).
 */
export const PlatformOnly = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PLATFORM_ONLY_KEY, true);
