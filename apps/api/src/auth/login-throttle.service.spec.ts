import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@hisobai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppException } from '../common/app.exception';
import { LoginThrottleService } from './login-throttle.service';

/**
 * §2.9 — 5 xato → 15 daqiqa blok. Bu testlar cheklovning **haqiqatan
 * ishlashini** ushlab turadi: u buzilsa, parol tanlash hujumi hech
 * qanday qarshilikka uchramaydi va buni hech kim sezmaydi.
 */

const MAX_ATTEMPTS = 5;
const BLOCK_MINUTES = 15;

interface Attempt {
  createdAt: Date;
  success: boolean;
  email: string;
  ip: string | null;
}

function makeService(attempts: Attempt[]): LoginThrottleService {
  const matches = (where: Record<string, unknown>, attempt: Attempt): boolean => {
    if ('email' in where && where.email !== attempt.email) return false;
    if ('ip' in where && where.ip !== attempt.ip) return false;
    if ('success' in where && where.success !== attempt.success) return false;

    const createdAt = where.createdAt as { gte?: Date; gt?: Date } | undefined;
    if (createdAt?.gte && attempt.createdAt < createdAt.gte) return false;
    if (createdAt?.gt && attempt.createdAt <= createdAt.gt) return false;
    return true;
  };

  const prisma = {
    loginAttempt: {
      findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          attempts
            .filter((attempt) => matches(where, attempt))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
        ),
      ),
      findMany: vi.fn(({ where, take }: { where: Record<string, unknown>; take: number }) =>
        Promise.resolve(
          attempts
            .filter((attempt) => matches(where, attempt))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, take),
        ),
      ),
      create: vi.fn(() => Promise.resolve({})),
    },
  };

  const config = {
    get: (key: string) => (key === 'LOGIN_MAX_ATTEMPTS' ? MAX_ATTEMPTS : BLOCK_MINUTES),
  };

  return new LoginThrottleService(prisma as never, config as never);
}

function failures(count: number, minutesAgo: number[], email = 'ega@hisobai.uz'): Attempt[] {
  return Array.from({ length: count }, (_, index) => ({
    email,
    ip: '10.0.0.1',
    success: false,
    createdAt: new Date(Date.now() - (minutesAgo[index] ?? 1) * 60_000),
  }));
}

describe('LoginThrottleService (§2.9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('4 ta xato — hali bloklanmaydi', async () => {
    const service = makeService(failures(4, [1, 2, 3, 4]));
    await expect(service.assertNotBlocked('ega@hisobai.uz', '10.0.0.1')).resolves.toBeUndefined();
  });

  it('5 ta xato — bloklanadi va 429 qaytaradi', async () => {
    const service = makeService(failures(5, [1, 2, 3, 4, 5]));
    try {
      await service.assertNotBlocked('ega@hisobai.uz', '10.0.0.1');
      expect.unreachable('blok kutilgan edi');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      const exception = error as AppException;
      expect(exception.code).toBe(ErrorCode.AUTH_BLOCKED);
      expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      // UI qancha kutishni aniq ko'rsatsin
      expect(exception.details?.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('oynadan chiqqan xatolar sanalmaydi', async () => {
    // Hammasi 15 daqiqadan eski
    const service = makeService(failures(5, [20, 25, 30, 35, 40]));
    await expect(service.assertNotBlocked('ega@hisobai.uz', '10.0.0.1')).resolves.toBeUndefined();
  });

  it('muvaffaqiyatli kirishdan keyingi xatolar qaytadan sanaladi', async () => {
    const attempts: Attempt[] = [
      ...failures(5, [10, 11, 12, 13, 14]),
      // 9 daqiqa oldin muvaffaqiyatli kirgan — undan oldingi xatolar bekor
      {
        email: 'ega@hisobai.uz',
        ip: '10.0.0.1',
        success: true,
        createdAt: new Date(Date.now() - 9 * 60_000),
      },
    ];
    const service = makeService(attempts);
    await expect(service.assertNotBlocked('ega@hisobai.uz', '10.0.0.1')).resolves.toBeUndefined();
  });

  it("boshqa IP dan bir xil email — email bo'yicha baribir bloklanadi", async () => {
    const service = makeService(failures(5, [1, 2, 3, 4, 5]));
    await expect(service.assertNotBlocked('ega@hisobai.uz', '203.0.113.9')).rejects.toThrow(
      AppException,
    );
  });

  it('boshqa email — bloklanmagan foydalanuvchi kira oladi', async () => {
    const service = makeService(failures(5, [1, 2, 3, 4, 5], 'boshqa@hisobai.uz'));
    // IP bir xil bo'lgani uchun IP bo'yicha blok ishlaydi — bu kutilgan xulq
    await expect(service.assertNotBlocked('ega@hisobai.uz', '10.0.0.1')).rejects.toThrow(
      AppException,
    );
    // IP boshqa bo'lsa — o'tadi
    await expect(
      service.assertNotBlocked('ega@hisobai.uz', '198.51.100.7'),
    ).resolves.toBeUndefined();
  });

  it("IP noma'lum bo'lsa faqat email bo'yicha tekshiriladi", async () => {
    const service = makeService(failures(2, [1, 2]));
    await expect(service.assertNotBlocked('ega@hisobai.uz', null)).resolves.toBeUndefined();
  });
});
