import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@hisobai/contracts';

export const PUBLIC_KEY = 'hisobai:public';
export const ROLES_KEY = 'hisobai:roles';
export const IDEMPOTENT_KEY = 'hisobai:idempotent';

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
