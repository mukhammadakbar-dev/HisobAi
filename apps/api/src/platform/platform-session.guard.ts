import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@hisobai/contracts';

import { AppException } from '../common/app.exception';
import { PLATFORM_ONLY_KEY } from '../common/auth.decorators';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { hashSessionToken } from '../common/session-token';
import type { AuthedPlatformRequest } from './platform-request';

/**
 * Platforma (SUPERADMIN) sessiya qo'riqchisi (§21.3, `ARCHITECTURE.md`
 * §14.3, `PERMISSIONS.md` §5).
 *
 * **Business `SessionGuard`dan tubdan farqli xulq:** bu yerda `@Roles()`
 * o'rnini bosadigan alohida "avtorizatsiya" qatlami yo'q — SUPERADMIN
 * uchun rol tushunchasi umuman yo'q (§25.2 izohi), faqat "haqiqiy,
 * bekor qilinmagan, faol SUPERADMIN sessiyasimi" degan yagona savol bor.
 * Shuning uchun bu guard `SessionGuard` kabi faqat ANIQLAMAYDI — u
 * `@PlatformOnly()` endpointda RAD HAM ETADI. Business `RolesGuard`ga
 * o'xshash ikkinchi qatlam shart emas: `PlatformOnly()`ni ko'rgan
 * `RolesGuard` allaqachon chetga chiqadi (`roles.guard.ts`dagi izoh).
 *
 * **`@PlatformOnly()` YO'Q endpointda hech narsa qilmaydi** — `true`
 * qaytaradi va business oqim (`SessionGuard` → `RolesGuard`) o'zgarishsiz
 * davom etadi. Ya'ni bu guard faqat platforma marshrutlariga tegishli,
 * global ro'yxatdan o'tishi esa faqat Nest'ning guard tartibi bitta
 * joyda saqlanishi uchun (`app.module.ts`).
 */
@Injectable()
export class PlatformSessionGuard implements CanActivate {
  private readonly logger = new Logger(PlatformSessionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPlatformRoute =
      this.reflector.getAllAndOverride<boolean>(PLATFORM_ONLY_KEY, targets) === true;

    if (!isPlatformRoute) return true;

    const request = context.switchToHttp().getRequest<AuthedPlatformRequest>();
    const cookieName = this.config.get('PLATFORM_SESSION_COOKIE_NAME', { infer: true });
    const token = (request as AuthedPlatformRequest & { cookies?: Record<string, string> })
      .cookies?.[cookieName];

    if (typeof token !== 'string' || token.length === 0) {
      throw AppException.unauthorized(ErrorCode.AUTH_REQUIRED, 'Tizimga kiring.');
    }

    // `PlatformAdmin`/`PlatformSession` — `SHOP_SCOPE_EXEMPT_MODELS`da
    // (`prisma.service.ts`): Shop konteksti bu so'rovga umuman aloqador
    // emas, shuning uchun bu yerda `runWithShopScope`/`runWithoutShopScope`
    // kerak emas — model bevosita chiqarilgan.
    const session = await this.prisma.platformSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { platformAdmin: true },
    });

    const now = new Date();
    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt <= now ||
      !session.platformAdmin.isActive
    ) {
      throw AppException.unauthorized(ErrorCode.AUTH_SESSION_EXPIRED, 'Sessiya tugadi. Qaytadan kiring.');
    }

    request.platformAdmin = {
      id: session.platformAdmin.id,
      email: session.platformAdmin.email,
      displayName: session.platformAdmin.displayName,
      sessionId: session.id,
    };

    await this.touch(session.id, session.lastSeenAt, now);
    return true;
  }

  private async touch(sessionId: string, lastSeenAt: Date, now: Date): Promise<void> {
    // §2.7 bilan bir xil naqsh — `session.guard.ts`ga qarang: "oxirgi
    // kirish" har so'rovda emas, 5 daqiqalik oynada bir marta yangilanadi.
    if (now.getTime() - lastSeenAt.getTime() < 5 * 60 * 1000) return;
    try {
      await this.prisma.platformSession.update({
        where: { id: sessionId },
        data: { lastSeenAt: now },
      });
    } catch (error) {
      this.logger.warn(`Platforma lastSeenAt yangilanmadi: ${(error as Error).message}`);
    }
  }
}
