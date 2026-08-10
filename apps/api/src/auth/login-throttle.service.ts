import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@hisobai/contracts';

import { AppException } from '../common/app.exception';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';

/**
 * Login urinishlari cheklovi va jurnali (§2.9, §2.10).
 *
 * Cheklov **bazada**, xotirada emas. Sabab: xotiradagi hisoblagich
 * jarayon qayta ishga tushganda nolga qaytadi — hujumchi uchun bu
 * cheklovni butunlay aylanib o'tish yo'li. `login_attempts` jadvali
 * bir vaqtning o'zida §2.10 dagi jurnal ham bo'ladi.
 *
 * Email va IP **alohida** hisoblanadi: bittasi oshsa ham bloklanadi.
 * Bittasi yetarli emas — bir IP dan turli emaillar bilan urinish ham,
 * turli IP lardan bitta email ham hujum naqshi.
 */
@Injectable()
export class LoginThrottleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async assertNotBlocked(email: string, ip: string | null): Promise<void> {
    const maxAttempts = this.config.get('LOGIN_MAX_ATTEMPTS', { infer: true });
    const blockMinutes = this.config.get('LOGIN_BLOCK_MINUTES', { infer: true });
    const windowMs = blockMinutes * 60 * 1000;
    const windowStart = new Date(Date.now() - windowMs);

    const unblockTimes = await Promise.all([
      this.unblockAt({ email }, windowStart, maxAttempts, windowMs),
      ip === null
        ? Promise.resolve(null)
        : this.unblockAt({ ip }, windowStart, maxAttempts, windowMs),
    ]);

    const blockedUntil = unblockTimes
      .filter((value): value is Date => value !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    if (!blockedUntil) return;

    const retryAfterSeconds = Math.max(1, Math.ceil((blockedUntil.getTime() - Date.now()) / 1000));
    throw AppException.tooManyRequests(
      ErrorCode.AUTH_BLOCKED,
      `Kirish vaqtincha bloklandi. ${String(Math.ceil(retryAfterSeconds / 60))} daqiqadan keyin urinib ko'ring.`,
      retryAfterSeconds,
    );
  }

  /**
   * Blok tugash vaqti yoki `null` (bloklanmagan).
   *
   * Muvaffaqiyatli kirishdan **keyingi** xatolar sanaladi: to'g'ri parol
   * bilan kirgan foydalanuvchi eski xatolari uchun bloklanmasin.
   */
  private async unblockAt(
    key: { email: string } | { ip: string },
    windowStart: Date,
    maxAttempts: number,
    windowMs: number,
  ): Promise<Date | null> {
    const lastSuccess = await this.prisma.loginAttempt.findFirst({
      where: { ...key, success: true, createdAt: { gte: windowStart } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const since = lastSuccess?.createdAt ?? windowStart;
    const failures = await this.prisma.loginAttempt.findMany({
      where: { ...key, success: false, createdAt: { gt: since } },
      orderBy: { createdAt: 'desc' },
      take: maxAttempts,
      select: { createdAt: true },
    });

    if (failures.length < maxAttempts) return null;

    // Sirpanuvchi oyna: eng eski sanalgan xato oynadan chiqqanda blok tugaydi
    const oldestCounted = failures[failures.length - 1];
    if (!oldestCounted) return null;
    return new Date(oldestCounted.createdAt.getTime() + windowMs);
  }

  /** §2.10 — muvaffaqiyatli va muvaffaqiyatsiz urinishlar yoziladi. */
  async record(
    email: string,
    ip: string | null,
    userAgent: string | null,
    success: boolean,
  ): Promise<void> {
    await this.prisma.loginAttempt.create({ data: { email, ip, userAgent, success } });
  }
}
