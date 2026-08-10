import { createHash, randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@hisobai/contracts';
import type {
  ChangePasswordInput,
  CurrentUserDto,
  LoginAttemptDto,
  LoginInput,
  SessionDto,
} from '@hisobai/contracts';
import type { User } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import type { RequestUser } from '../common/request-user';
import { createSessionToken, hashSessionToken } from '../common/session-token';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { MailProvider } from '../mail/mail.provider';
import { LoginThrottleService } from './login-throttle.service';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password';

/** §2.5 — havola qisqa yashaydi: o'g'irlangan email qutisi abadiy kalit bo'lmasin. */
const RESET_TOKEN_TTL_MINUTES = 60;
/** `API.md` §6 — parol tiklash: 3 / kun (email bo'yicha). */
const RESET_REQUESTS_PER_DAY = 3;

export interface LoginResult {
  user: CurrentUserDto;
  token: string;
  expiresAt: Date;
}

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly throttle: LoginThrottleService,
    private readonly audit: AuditService,
    private readonly mail: MailProvider,
  ) {}

  // ───────────────────────────── Kirish ─────────────────────────────

  async login(input: LoginInput, context: RequestContext): Promise<LoginResult> {
    await this.throttle.assertNotBlocked(input.email, context.ip);

    const user = await this.prisma.user.findUnique({ where: { email: input.email } });

    /**
     * Foydalanuvchi topilmasa ham parol tekshiriladi (soxta hash bilan).
     * Usiz javob vaqtining farqi qaysi email ro'yxatdan o'tganini
     * oshkor qilardi.
     */
    const passwordValid = await verifyPassword(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      input.password,
    );

    if (!user || !passwordValid) {
      await this.throttle.record(input.email, context.ip, context.userAgent, false);
      throw AppException.unauthorized(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        "Email yoki parol noto'g'ri.",
      );
    }

    if (!user.isActive) {
      await this.throttle.record(input.email, context.ip, context.userAgent, false);
      throw AppException.forbidden(
        ErrorCode.AUTH_USER_INACTIVE,
        "Bu hisob o'chirilgan. Do'kon egasiga murojaat qiling.",
      );
    }

    await this.throttle.record(input.email, context.ip, context.userAgent, true);
    return this.issueSession(user, context);
  }

  /** §2.7 — sessiya 30 kun. Token bazada faqat hash sifatida turadi. */
  private async issueSession(user: User, context: RequestContext): Promise<LoginResult> {
    const ttlDays = this.config.get('SESSION_TTL_DAYS', { infer: true });
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    const token = createSessionToken();

    await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashSessionToken(token),
        userAgent: context.userAgent,
        ip: context.ip,
        expiresAt,
      },
    });

    return { user: toCurrentUser(user), token, expiresAt };
  }

  async logout(sessionId: string): Promise<void> {
    // Idempotent: allaqachon bekor qilingan sessiyani qayta bekor qilish xato emas
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // ─────────────────────────── Sessiyalar ───────────────────────────

  /** §2.7 — faol sessiyalar: qurilma, IP, oxirgi kirish. */
  async listSessions(userId: string, currentSessionId: string): Promise<SessionDto[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ip: session.ip,
      lastSeenAt: session.lastSeenAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
      isCurrent: session.id === currentSessionId,
    }));
  }

  /**
   * `PERMISSIONS.md` P4 — so'rov **doim** `userId` bilan cheklanadi.
   *
   * Faqat `id` bo'yicha o'chirilsa, boshqa foydalanuvchining sessiyasini
   * bekor qilish mumkin bo'lardi (IDOR). MVP'da bitta foydalanuvchi bor,
   * lekin shart hozirdan qo'yiladi — keyin qidirib yurilmasin.
   */
  async revokeSession(actor: RequestUser, sessionId: string, ip: string | null): Promise<void> {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId: actor.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count === 0) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, 'Bunday faol sessiya topilmadi.');
    }

    await this.audit.recordDetached({
      actorId: actor.id,
      action: 'SESSION_REVOKED',
      entityType: 'Session',
      entityId: sessionId,
      ip,
    });
  }

  /** Joriy qurilmadan tashqari hammasini chiqarish — parol o'g'irlanishiga javob. */
  async revokeOtherSessions(actor: RequestUser, ip: string | null): Promise<{ revoked: number }> {
    const result = await this.prisma.session.updateMany({
      where: { userId: actor.id, revokedAt: null, id: { not: actor.sessionId } },
      data: { revokedAt: new Date() },
    });

    await this.audit.recordDetached({
      actorId: actor.id,
      action: 'SESSION_REVOKED_ALL',
      entityType: 'Session',
      after: { revoked: result.count },
      ip,
    });

    return { revoked: result.count };
  }

  /** §2.10 — sozlamalarda ko'rinadigan kirish jurnali. */
  async listLoginAttempts(limit: number): Promise<LoginAttemptDto[]> {
    const attempts = await this.prisma.loginAttempt.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return attempts.map((attempt) => ({
      id: attempt.id,
      email: attempt.email,
      ip: attempt.ip,
      userAgent: attempt.userAgent,
      success: attempt.success,
      createdAt: attempt.createdAt.toISOString(),
    }));
  }

  // ──────────────────────────── Parollar ────────────────────────────

  /**
   * Parol o'zgartirilganda **boshqa barcha sessiyalar bekor qilinadi**.
   *
   * Sabab: parolni o'zgartirishning eng ko'p uchraydigan sababi — uni
   * kimdir bilib qolgan degan shubha. Eski sessiyalar ochiq qolsa, amal
   * maqsadini bajarmaydi. Joriy qurilma qoladi — foydalanuvchi o'zini
   * chiqarib yubormasin.
   */
  async changePassword(
    actor: RequestUser,
    input: ChangePasswordInput,
    ip: string | null,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: actor.id } });
    if (!user) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, 'Foydalanuvchi topilmadi.');
    }

    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw AppException.badRequest(
        ErrorCode.AUTH_CURRENT_PASSWORD_INVALID,
        "Joriy parol noto'g'ri.",
        'currentPassword',
      );
    }

    const passwordHash = await hashPassword(input.newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null, id: { not: actor.sessionId } },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'PASSWORD_CHANGED',
        entityType: 'User',
        entityId: user.id,
        ip,
      });
    });
  }

  /**
   * §2.5 — parol tiklash havolasi.
   *
   * Javob **har doim bir xil** (204), email mavjud bo'lsa ham, bo'lmasa
   * ham. Aks holda bu endpoint ro'yxatdan o'tgan emaillarni tekshirish
   * vositasiga aylanadi. Shu sabab kunlik limit oshganda ham xato
   * qaytarilmaydi — xat shunchaki yuborilmaydi.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      this.logger.debug(`Parol tiklash: ${email} uchun hisob yo'q — xat yuborilmadi`);
      return;
    }

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentRequests = await this.prisma.passwordResetToken.count({
      where: { userId: user.id, createdAt: { gte: dayAgo } },
    });
    if (recentRequests >= RESET_REQUESTS_PER_DAY) {
      this.logger.warn(`Parol tiklash limiti oshdi: ${email}`);
      return;
    }

    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
      },
    });

    const webOrigin = this.config.get('WEB_ORIGIN', { infer: true });
    await this.mail.sendPasswordReset(
      user.email,
      `${webOrigin}/reset-password?token=${encodeURIComponent(token)}`,
    );
  }

  /**
   * Havola bo'yicha yangi parol o'rnatadi.
   *
   * Bu yerda **barcha** sessiyalar bekor qilinadi, `changePassword` dan
   * farqli o'laroq: parolni unutgan odam odatda hisobiga kirish
   * yo'qotgan bo'ladi va ochiq qolgan sessiya begonaniki bo'lishi mumkin.
   */
  async resetPassword(token: string, newPassword: string, ip: string | null): Promise<void> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!record || record.expiresAt <= new Date()) {
      throw AppException.badRequest(
        ErrorCode.AUTH_TOKEN_INVALID,
        'Havola eskirgan. Parolni tiklashni qaytadan boshlang.',
      );
    }
    if (record.usedAt !== null) {
      throw AppException.badRequest(ErrorCode.AUTH_TOKEN_USED, 'Bu havola allaqachon ishlatilgan.');
    }

    const passwordHash = await hashPassword(newPassword);

    await this.prisma.$transaction(async (tx) => {
      /**
       * `usedAt: null` sharti bilan — ikki parallel so'rovdan faqat
       * bittasi o'tadi. Usiz bitta havola bilan ikki marta parol
       * o'rnatish mumkin bo'lardi.
       */
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw AppException.badRequest(
          ErrorCode.AUTH_TOKEN_USED,
          'Bu havola allaqachon ishlatilgan.',
        );
      }

      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(tx, {
        actorId: record.userId,
        action: 'PASSWORD_RESET',
        entityType: 'User',
        entityId: record.userId,
        ip,
      });
    });
  }
}

function toCurrentUser(user: User): CurrentUserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    theme: user.theme,
  };
}
