import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountStatus } from '@prisma/client';

import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import type { AuthedRequest } from './request-user';
import { hashSessionToken } from './session-token';

/**
 * `lastSeenAt` shu oraliqdan tez-tez yangilanmaydi.
 *
 * Har so'rovda `UPDATE` qilinsa, oddiy ro'yxatni ochish ham yozuv
 * tranzaksiyasiga aylanadi. Ustunning maqsadi — sozlamalarda "oxirgi
 * kirish" ni ko'rsatish (§2.7), unga daqiqa aniqligi yetarli.
 */
const LAST_SEEN_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Sessiya cookie'sini foydalanuvchiga aylantiradi (§2.7, §2.8).
 *
 * **Bu guard hech qachon rad etmaydi.** Sababi ataylab: `@Public()`
 * sahifalar ham (masalan `/auth/login`) eskirgan cookie bilan ochilishi
 * mumkin. Agar guard 401 tashlasa, muddati o'tgan sessiyasi bor
 * foydalanuvchi **qaytadan kira olmay** qolardi — chiqib ketishning
 * yagona yo'li cookie'ni qo'lda o'chirish bo'lardi.
 *
 * Shuning uchun bu yerda faqat aniqlash bor: sessiya haqiqiy bo'lsa
 * `request.user` to'ldiriladi. Rad etish qarori bitta joyda —
 * `RolesGuard` da (default DENY, `PERMISSIONS.md` §1).
 */
@Injectable()
export class SessionGuard implements CanActivate {
  private readonly logger = new Logger(SessionGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const cookieName = this.config.get('SESSION_COOKIE_NAME', { infer: true });
    const token = (request as AuthedRequest & { cookies?: Record<string, string> }).cookies?.[
      cookieName
    ];

    if (typeof token !== 'string' || token.length === 0) return true;

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true },
    });

    // Cookie bor, lekin sessiya yo'q / bekor qilingan / muddati o'tgan.
    // Buni belgilab qo'yamiz: RolesGuard "Sessiya tugadi" deb aniqroq
    // aytadi, "Tizimga kiring" degan umumiy matn o'rniga.
    //
    // `isActive Boolean` §21.6 bilan `status: AccountStatus`ga almashtirildi
    // (6-bosqich, 3-qadam sxema yarmi) — bu yerdagi almashtirish shuning
    // ustidan kompilyatsiya qilish uchun MINIMAL tuzatish, `UserRole.OWNER`
    // bilan bog'liq boshqa nomuvofiqliklar 4-bosqich ishi (`@hisobai/contracts`
    // hali `SHOP_ADMIN`ga o'tkazilmagan).
    const now = new Date();
    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt <= now ||
      session.user.status !== AccountStatus.ACTIVE
    ) {
      request.sessionExpired = true;
      return true;
    }

    request.user = {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      role: session.user.role,
      theme: session.user.theme,
      sessionId: session.id,
      shopId: session.user.shopId,
    };

    await this.touch(session.id, session.lastSeenAt, now);
    return true;
  }

  private async touch(sessionId: string, lastSeenAt: Date, now: Date): Promise<void> {
    if (now.getTime() - lastSeenAt.getTime() < LAST_SEEN_UPDATE_INTERVAL_MS) return;

    try {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { lastSeenAt: now },
      });
    } catch (error) {
      // "Oxirgi kirish" vaqtini yangilay olmaslik so'rovni buzmaydi —
      // bu ko'rsatma uchun ma'lumot, kirish huquqi emas.
      this.logger.warn(`lastSeenAt yangilanmadi: ${(error as Error).message}`);
    }
  }
}
