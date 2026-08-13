import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import type { AuthedRequest, RequestUser } from './request-user';

/**
 * Kontrollerda joriy foydalanuvchini oladi.
 *
 * ```ts
 * @Get('me')
 * @Roles(UserRole.SHOP_ADMIN)
 * me(@CurrentUser() user: RequestUser) { … }
 * ```
 *
 * Tip `RequestUser` — `undefined` emas. Buni `RolesGuard` kafolatlaydi:
 * `@Roles(...)` qo'yilgan endpointga foydalanuvchisiz so'rov umuman
 * yetib bormaydi. `@Public()` endpointda esa bu dekorator ishlatilmaydi.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser => {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const user = request.user;
    if (!user) {
      // Bu yerga tushish — dasturchi xatosi: @Roles() qo'yilmagan
      // endpointda @CurrentUser() ishlatilgan.
      throw new Error('@CurrentUser() faqat @Roles(...) bilan himoyalangan endpointda ishlaydi');
    }
    return user;
  },
);
