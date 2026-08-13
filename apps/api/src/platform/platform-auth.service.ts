import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@hisobai/contracts';
import type { PlatformAdminDto, PlatformLoginInput } from '@hisobai/contracts';
import type { PlatformAdmin } from '@prisma/client';

import { AppException } from '../common/app.exception';
import { createSessionToken, hashSessionToken } from '../common/session-token';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { LoginThrottleService } from '../auth/login-throttle.service';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '../auth/password';
import type { RequestContext } from '../auth/auth.service';

export interface PlatformLoginResult {
  admin: PlatformAdminDto;
  token: string;
  expiresAt: Date;
}

/**
 * SUPERADMIN kirishi (§21.3, §25.3–§25.4).
 *
 * **Nima qayta ishlatilgan, nima yo'q** (`Assistant` topshirig'idagi
 * savol):
 *
 *  - Argon2 hash (`auth/password.ts`) — o'zgarishsiz. Parol siyosati
 *    bitta bo'lishi shart: ikkita tizimda ikkita hash parametri
 *    ushlab turishga arzimaydigan xavfsizlik farqi.
 *  - Sessiya tokeni hash'lash (`common/session-token.ts`) — o'zgarishsiz.
 *  - **Login urinishi jurnali/bloki (`LoginThrottleService`, `login_attempts`)
 *    — QAYTA ISHLATILADI, ALOHIDA jadval OCHILMAYDI.** `login_attempts`
 *    modelidagi izoh (`schema.prisma`) buni ATAYLAB oldindan aytib
 *    qo'ygan: "urinish paytida email hali hech qanday Shop'ga aloqador
 *    ekanligi ma'lum emas (SUPERADMIN login urinishlari ham shu yerga
 *    tushishi mumkin)". Email maydoni FK emas — jadval allaqachon "qaysi
 *    jadvaldan" bilishni talab qilmaydi, faqat email satrini. Alohida
 *    `platform_login_attempts` jadvali ikkita amaliy zarar keltirardi:
 *    (a) bir xil email business'da ham, platformada ham urinilsa, ikki
 *    mustaqil hisoblagich hujumchiga "ikki baravar urinish" imkonini
 *    berardi; (b) `/settings` dagi "kirish jurnali" (§2.10) SUPERADMIN
 *    urinishlarini butunlay ko'rmay qolardi, garchi ular xuddi shu
 *    IP/email fazosida bo'lsa ham.
 *  - **Sessiya jadvali va cookie — ALOHIDA** (`platform_sessions`,
 *    `PLATFORM_SESSION_COOKIE_NAME`). Bu qayta ishlatilmaydi: §21.3
 *    invarianti aynan shunga tayanadi — SUPERADMIN'da `shopId` yo'q, va
 *    agar sessiya `users`/`sessions`da saqlansa, bu invariant butunlay
 *    yo'qoladi.
 */
@Injectable()
export class PlatformAuthService {
  private readonly logger = new Logger(PlatformAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly throttle: LoginThrottleService,
  ) {}

  async login(input: PlatformLoginInput, context: RequestContext): Promise<PlatformLoginResult> {
    await this.throttle.assertNotBlocked(input.email, context.ip);

    const admin = await this.prisma.platformAdmin.findUnique({ where: { email: input.email } });

    // §2.4 izohidagi bir xil mulohaza: foydalanuvchi topilmasa ham parol
    // "tekshiriladi" — javob vaqti farqi orqali email ro'yxatini
    // tuzib olish (foydalanuvchi sanash hujumi) oldi olinadi.
    const passwordValid = await verifyPassword(
      admin?.passwordHash ?? DUMMY_PASSWORD_HASH,
      input.password,
    );

    if (!admin || !passwordValid) {
      await this.throttle.record(input.email, context.ip, context.userAgent, false);
      throw AppException.unauthorized(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        "Email yoki parol noto'g'ri.",
      );
    }

    if (!admin.isActive) {
      await this.throttle.record(input.email, context.ip, context.userAgent, false);
      throw AppException.forbidden(ErrorCode.AUTH_USER_INACTIVE, 'Bu hisob o‘chirilgan.');
    }

    await this.throttle.record(input.email, context.ip, context.userAgent, true);
    return this.issueSession(admin, context);
  }

  private async issueSession(
    admin: PlatformAdmin,
    context: RequestContext,
  ): Promise<PlatformLoginResult> {
    const ttlDays = this.config.get('PLATFORM_SESSION_TTL_DAYS', { infer: true });
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    const token = createSessionToken();

    await this.prisma.platformSession.create({
      data: {
        platformAdminId: admin.id,
        tokenHash: hashSessionToken(token),
        userAgent: context.userAgent,
        ip: context.ip,
        expiresAt,
      },
    });

    return { admin: toDto(admin), token, expiresAt };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.platformSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

function toDto(admin: PlatformAdmin): PlatformAdminDto {
  return { id: admin.id, email: admin.email, displayName: admin.displayName };
}
