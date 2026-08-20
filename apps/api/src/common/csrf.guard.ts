import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ErrorCode } from '@hisobai/contracts';
import type { Request } from 'express';

import { AppException } from './app.exception';

/** O'zgartiruvchi metodlar — faqat shular tekshiriladi. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const CSRF_COOKIE_NAME = 'hisobai_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Double-submit CSRF himoyasi (§2.8, `API.md` §1).
 *
 * Ishlashi: server `csrf` cookie'sini `HttpOnly` **emas** qilib qo'yadi;
 * client uni o'qib, har o'zgartiruvchi so'rovda `X-CSRF-Token` sarlavhasida
 * qaytaradi. Boshqa saytdagi soxta forma cookie'ni **o'qiy olmaydi**
 * (same-origin siyosati), demak sarlavhani ham to'ldira olmaydi.
 *
 * `SameSite` o'zi ham ko'p hujumni to'sadi (productionda `Strict`,
 * development'da `Lax` — `session-token.ts`), lekin u brauzerga bog'liq
 * yagona himoya bo'lib qolardi. Bu tekshiruv undan mustaqil ishlaydi va
 * ikkala muhitda ham bir xil qo'llanadi.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!MUTATING_METHODS.has(request.method)) return true;

    const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
    const cookieToken = cookies?.[CSRF_COOKIE_NAME];
    const headerToken = request.headers[CSRF_HEADER_NAME];

    if (
      typeof cookieToken !== 'string' ||
      cookieToken.length === 0 ||
      typeof headerToken !== 'string' ||
      headerToken !== cookieToken
    ) {
      throw AppException.forbidden(
        ErrorCode.AUTH_CSRF_INVALID,
        "So'rov tasdiqlanmadi. Sahifani yangilab, qaytadan urinib ko'ring.",
      );
    }

    return true;
  }
}
