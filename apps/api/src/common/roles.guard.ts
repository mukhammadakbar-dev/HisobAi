import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, UserRole } from '@hisobai/contracts';

import { AppException } from './app.exception';
import { PLATFORM_ONLY_KEY, PUBLIC_KEY, ROLES_KEY, SHOP_EXEMPT_KEY } from './auth.decorators';
import type { AuthedRequest } from './request-user';

export type { RequestUser } from './request-user';

/**
 * **Default DENY** ruxsat qorovuli (`PERMISSIONS.md` §1).
 *
 * Qoida: `@Public()` ham, `@Roles(...)` ham qo'yilmagan endpoint hech
 * kimga ochilmaydi. Bu ataylab qattiq: unutilgan dekorator sabab endpoint
 * jimgina ochilib qolishi — eng jim va eng qimmat xavfsizlik xatosi.
 *
 * Guard faqat **rolni** tekshiradi. Resurs egaligi (masalan sessiya yoki
 * fayl kimniki ekani) servis qatlamida tekshiriladi — buni guard bilib
 * bo'lmaydi (`PERMISSIONS.md` §3, P4–P6).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets) === true) {
      return true;
    }

    /**
     * `@PlatformOnly()` — bu yo'lning ruxsat qarori `PlatformSessionGuard`da
     * allaqachon qabul qilingan (u business `SessionGuard`dan farqli, RAD
     * ham ETADI, faqat aniqlab qo'ymaydi — §21.3 platforma yo'lida
     * ikkinchi qatlam yo'q). `RolesGuard` shu yerda faqat "business rol
     * mantig'i bu endpointga aralashmasin" deb chetga chiqadi.
     *
     * `@Roles(...)` bilan bitta endpointda BIRGA kelmasligi
     * `auth.decorators.ts`dagi `PlatformOnly()` izohida tasvirlangan
     * strukturaviy testda tekshiriladi (`roles.guard.spec.ts`) — shu
     * sabab bu yerda ikkalasi ham o'qilgan bo'lsa xato tashlash SHART
     * emas: default DENY baribir buzilmaydi, chunki ikkalasi bir vaqtda
     * true bo'lgan holatning o'zi kod bazasida yo'qligi testda qotiriladi.
     */
    if (this.reflector.getAllAndOverride<boolean>(PLATFORM_ONLY_KEY, targets) === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const user = request.user;

    if (!user) {
      // Cookie bor edi, lekin sessiya yaroqsiz — foydalanuvchi "nega
      // chiqib ketdim?" degan savolga javob olsin (§2.7).
      throw request.sessionExpired === true
        ? AppException.unauthorized(
            ErrorCode.AUTH_SESSION_EXPIRED,
            'Sessiya tugadi. Qaytadan kiring.',
          )
        : AppException.unauthorized(ErrorCode.AUTH_REQUIRED, 'Tizimga kiring.');
    }

    const allowed = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, targets);

    // Dekorator yo'q → yopiq. Ochish uchun aniq @Roles(...) yozilishi kerak.
    if (!allowed || allowed.length === 0) {
      throw AppException.forbidden(ErrorCode.FORBIDDEN, "Bu amalga ruxsatingiz yo'q.");
    }

    if (!allowed.includes(user.role)) {
      throw AppException.forbidden(ErrorCode.FORBIDDEN, "Bu amalga ruxsatingiz yo'q.");
    }

    // §21.10, §14.8 — rol to'g'ri, lekin account'ga Shop biriktirilmagan.
    // `@ShopExempt()` bilan belgilanmagan endpoint DEFAULT holda
    // shop-scoped deb hisoblanadi (`auth.decorators.ts`dagi izohga qarang).
    // `403` emas `409`: bu "ruxsat yo'q" emas, "hali sozlanmagan" — frontend
    // shu kod bo'yicha `/app/setup-shop`ga yo'naltiradi.
    const shopExempt = this.reflector.getAllAndOverride<boolean>(SHOP_EXEMPT_KEY, targets);
    if (shopExempt !== true && user.shopId === null) {
      throw AppException.conflict(
        ErrorCode.SHOP_SETUP_REQUIRED,
        "Avval do'koningizni sozlang.",
      );
    }

    return true;
  }
}
