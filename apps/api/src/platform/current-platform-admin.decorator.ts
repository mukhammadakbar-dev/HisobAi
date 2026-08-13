import { ExecutionContext, createParamDecorator } from '@nestjs/common';

import type { AuthedPlatformRequest, PlatformAdminAuth } from './platform-request';

/**
 * `common/current-user.decorator.ts` bilan bir xil naqsh, faqat platforma
 * uchun. Tip `PlatformAdminAuth` — `undefined` emas: `@PlatformOnly()`
 * qo'yilgan endpointga sessiyasiz so'rov `PlatformSessionGuard`da to'xtaydi.
 */
export const CurrentPlatformAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PlatformAdminAuth => {
    const request = context.switchToHttp().getRequest<AuthedPlatformRequest>();
    const admin = request.platformAdmin;
    if (!admin) {
      throw new Error(
        '@CurrentPlatformAdmin() faqat @PlatformOnly() bilan himoyalangan endpointda ishlaydi',
      );
    }
    return admin;
  },
);
