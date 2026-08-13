import { createHash } from 'node:crypto';

import { ErrorCode, UserRole } from '@hisobai/contracts';
import { AccountStatus, type PasswordResetToken, type Session, type User } from '@prisma/client';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppException } from '../common/app.exception';
import type { RequestUser } from '../common/request-user';
import { AuthService } from './auth.service';
import { hashPassword } from './password';

/**
 * Auth servisining **xavfsizlik va’dalari** sinaladi — ular buzilsa
 * hech qanday xato ko'rinmaydi, tizim shunchaki himoyasiz bo'lib qoladi:
 *
 *  - noto'g'ri parol va mavjud bo'lmagan email **bir xil** javob berishi
 *    (aks holda endpoint ro'yxatdan o'tgan emaillarni tekshirish
 *    vositasiga aylanadi);
 *  - parol o'zgarganda boshqa sessiyalarning yopilishi (§2.7) — usiz
 *    "parolni o'zgartirdim" amali o'z maqsadini bajarmaydi;
 *  - tiklash havolasining **bir martaligi** — takroran ishlatilsa
 *    o'g'irlangan xat abadiy kalit bo'lib qoladi.
 */

const EMAIL = 'ega@hisobai.uz';
const PASSWORD = 'toParol123';
const CONTEXT = { ip: '10.0.0.1', userAgent: 'Chrome' };

const ACTOR: RequestUser = {
  id: 'user-1',
  email: EMAIL,
  displayName: "Do'kon egasi",
  role: UserRole.SHOP_ADMIN,
  theme: 'SYSTEM',
  sessionId: 'session-current',
} as RequestUser;

let passwordHash: string;

beforeAll(async () => {
  // Argon2id sekin — bitta hash yaratib, hamma testda qayta ishlatamiz
  passwordHash = await hashPassword(PASSWORD);
});

interface World {
  user: User | null;
  sessions: Session[];
  resetTokens: PasswordResetToken[];
}

function makeService(overrides: Partial<World> = {}) {
  const world: World = {
    user: {
      id: ACTOR.id,
      email: EMAIL,
      displayName: "Do'kon egasi",
      role: UserRole.SHOP_ADMIN,
      theme: 'SYSTEM',
      passwordHash,
      status: AccountStatus.ACTIVE,
    } as User,
    sessions: [
      { id: 'session-current', userId: ACTOR.id, revokedAt: null } as Session,
      { id: 'session-phone', userId: ACTOR.id, revokedAt: null } as Session,
      { id: 'session-laptop', userId: ACTOR.id, revokedAt: null } as Session,
    ],
    resetTokens: [],
    ...overrides,
  };

  const audit = {
    record: vi.fn(() => Promise.resolve()),
    recordDetached: vi.fn(() => Promise.resolve()),
  };
  const mail = { sendPasswordReset: vi.fn(() => Promise.resolve()) };
  const throttle = {
    assertNotBlocked: vi.fn(() => Promise.resolve()),
    record: vi.fn(() => Promise.resolve()),
  };

  const model = {
    user: {
      findUnique: () => Promise.resolve(world.user),
      update: ({ data }: { data: Partial<User> }) => {
        world.user = { ...world.user, ...data } as User;
        return Promise.resolve(world.user);
      },
    },
    session: {
      create: () => Promise.resolve({}),
      updateMany: ({ where }: { where: { id?: { not: string } } }) => {
        // `id: { not: current }` — joriy sessiyadan tashqarisi
        const excluded = where.id?.not;
        let count = 0;
        world.sessions = world.sessions.map((session) => {
          if (session.revokedAt !== null) return session;
          if (excluded !== undefined && session.id === excluded) return session;
          count += 1;
          return { ...session, revokedAt: new Date() };
        });
        return Promise.resolve({ count });
      },
    },
    passwordResetToken: {
      count: () => Promise.resolve(world.resetTokens.length),
      // Servis faqat shu uchtasini yuboradi — qolganini baza to'ldiradi
      create: ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
        /**
         * Baza standart qiymatlari takrorlanadi: `id` avtomatik,
         * `usedAt` esa **NULL**. Ularsiz dublyor `usedAt: undefined`
         * beradi va servisdagi `!== null` sharti birinchi urinishdayoq
         * "havola ishlatilgan" deb xato qaytaradi — ya'ni test kodni
         * emas, dublyorni sinagan bo'lardi.
         */
        const row = {
          id: `token-${String(world.resetTokens.length + 1)}`,
          usedAt: null,
          ...data,
        } as PasswordResetToken;
        world.resetTokens.push(row);
        return Promise.resolve(row);
      },
      findUnique: ({ where }: { where: { tokenHash: string } }) =>
        Promise.resolve(world.resetTokens.find((t) => t.tokenHash === where.tokenHash) ?? null),
      updateMany: ({ where, data }: { where: { id: string }; data: { usedAt: Date } }) => {
        const target = world.resetTokens.find((t) => t.id === where.id && t.usedAt === null);
        if (!target) return Promise.resolve({ count: 0 });
        target.usedAt = data.usedAt;
        return Promise.resolve({ count: 1 });
      },
    },
  };

  const prisma = {
    ...model,
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(model),
  };

  const config = {
    get: (key: string) => (key === 'SESSION_TTL_DAYS' ? 30 : 'http://localhost:3000'),
  };

  const service = new AuthService(
    prisma as never,
    config as never,
    throttle as never,
    audit as never,
    mail as never,
  );

  return { service, world, audit, mail, throttle };
}

function activeSessionIds(world: World): string[] {
  return world.sessions.filter((session) => session.revokedAt === null).map((s) => s.id);
}

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login (§2.9, §2.10)', () => {
    it("to'g'ri parol — sessiya beriladi va urinish yoziladi", async () => {
      const { service, throttle } = makeService();

      const result = await service.login({ email: EMAIL, password: PASSWORD }, CONTEXT);

      expect(result.user.email).toBe(EMAIL);
      expect(result.token).toHaveLength(43); // 32 bayt base64url
      expect(throttle.record).toHaveBeenCalledWith(EMAIL, '10.0.0.1', 'Chrome', true);
    });

    it("noto'g'ri parol — 401 va muvaffaqiyatsiz urinish yoziladi", async () => {
      const { service, throttle } = makeService();

      try {
        await service.login({ email: EMAIL, password: 'boshqa-parol' }, CONTEXT);
        expect.unreachable('xato kutilgan edi');
      } catch (error) {
        expect((error as AppException).code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
      }
      expect(throttle.record).toHaveBeenCalledWith(EMAIL, '10.0.0.1', 'Chrome', false);
    });

    it("mavjud bo'lmagan email — AYNAN bir xil xato (mavjudlik oshkor bo'lmasin)", async () => {
      const { service } = makeService({ user: null });

      try {
        await service.login({ email: 'yoq@hisobai.uz', password: PASSWORD }, CONTEXT);
        expect.unreachable('xato kutilgan edi');
      } catch (error) {
        // Noto'g'ri paroldagi kod bilan bir xil — farq qilsa, bu endpoint
        // ro'yxatdan o'tgan emaillarni tekshirish vositasiga aylanardi
        expect((error as AppException).code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
      }
    });

    it("o'chirilgan hisob — parol to'g'ri bo'lsa ham kiritilmaydi", async () => {
      const { service, world } = makeService();
      world.user = { ...world.user, status: AccountStatus.SUSPENDED } as User;

      try {
        await service.login({ email: EMAIL, password: PASSWORD }, CONTEXT);
        expect.unreachable('xato kutilgan edi');
      } catch (error) {
        expect((error as AppException).code).toBe(ErrorCode.AUTH_USER_INACTIVE);
      }
    });
  });

  describe('changePassword (§2.7)', () => {
    it('boshqa sessiyalar yopiladi, joriysi qoladi', async () => {
      const { service, world } = makeService();

      await service.changePassword(
        ACTOR,
        { currentPassword: PASSWORD, newPassword: 'yangiParol123' },
        '10.0.0.1',
      );

      // Parolni o'zgartirishning sababi odatda "kimdir bilib qoldi" —
      // eski sessiyalar ochiq qolsa amal maqsadini bajarmaydi
      expect(activeSessionIds(world)).toEqual(['session-current']);
    });

    it('joriy parol xato — yozuvga tegilmaydi', async () => {
      const { service, world } = makeService();
      const before = world.user?.passwordHash;

      try {
        await service.changePassword(
          ACTOR,
          { currentPassword: 'xato', newPassword: 'yangiParol123' },
          null,
        );
        expect.unreachable('xato kutilgan edi');
      } catch (error) {
        const exception = error as AppException;
        expect(exception.code).toBe(ErrorCode.AUTH_CURRENT_PASSWORD_INVALID);
        // Xato aynan shu maydonga bog'lanadi (`FRONTEND.md` §5.2)
        expect(exception.field).toBe('currentPassword');
      }

      expect(world.user?.passwordHash).toBe(before);
      expect(activeSessionIds(world)).toHaveLength(3);
    });
  });

  describe('forgotPassword / resetPassword (§2.5)', () => {
    it("mavjud bo'lmagan email — xat yuborilmaydi, lekin xato ham qaytmaydi", async () => {
      const { service, mail } = makeService({ user: null });

      await expect(service.forgotPassword('yoq@hisobai.uz')).resolves.toBeUndefined();
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('havola yuboriladi va tokenli manzilni o‘z ichiga oladi', async () => {
      const { service, mail } = makeService();

      await service.forgotPassword(EMAIL);

      expect(mail.sendPasswordReset).toHaveBeenCalledOnce();
      const [to, url] = mail.sendPasswordReset.mock.calls[0] as unknown as [string, string];
      expect(to).toBe(EMAIL);
      // Web marshruti shu manzilga bog'langan — o'zgarsa xatlar ishlamay qoladi
      expect(url).toContain('/reset-password?token=');
    });

    it('tiklash BARCHA sessiyalarni yopadi va havola bir martalik', async () => {
      const { service, world, mail } = makeService();

      // Haqiqiy oqim: avval havola so'raladi
      await service.forgotPassword(EMAIL);
      const token = tokenFromMail(mail as unknown as MailSpy, world);

      await service.resetPassword(token, 'yangiParol123', '10.0.0.1');

      // `changePassword` dan farqli — bu yerda joriy qurilma ham chiqadi
      expect(activeSessionIds(world)).toEqual([]);

      // Ikkinchi urinish — o'g'irlangan xat abadiy kalit bo'lmasin
      try {
        await service.resetPassword(token, 'boshqaParol123', null);
        expect.unreachable('xato kutilgan edi');
      } catch (error) {
        expect((error as AppException).code).toBe(ErrorCode.AUTH_TOKEN_USED);
      }
    });

    it('muddati o‘tgan havola rad etiladi', async () => {
      const { service, world, mail } = makeService();

      await service.forgotPassword(EMAIL);
      const token = tokenFromMail(mail as unknown as MailSpy, world);
      const stored = world.resetTokens[0];
      if (stored) stored.expiresAt = new Date(Date.now() - 1000);

      try {
        await service.resetPassword(token, 'yangiParol123', null);
        expect.unreachable('xato kutilgan edi');
      } catch (error) {
        expect((error as AppException).code).toBe(ErrorCode.AUTH_TOKEN_INVALID);
      }
    });
  });
});

/**
 * Xom token faqat **xatga** ketadi; bazada uning SHA-256 hash'i turadi.
 *
 * Shuning uchun test tokenni aynan xatdagi havoladan oladi va hash'ini
 * bazadagi qiymat bilan solishtiradi — shunda `forgotPassword` va
 * `resetPassword` bitta haqiqiy zanjirda sinaladi, ikkita alohida
 * mock sifatida emas.
 */
function tokenFromMail(mail: MailSpy, world: World): string {
  const call = mail.sendPasswordReset.mock.calls[0];
  if (!call) throw new Error('xat yuborilmadi');

  const token = new URL(call[1]).searchParams.get('token');
  if (token === null) throw new Error("havolada token yo'q");

  const stored = world.resetTokens[0];
  if (!stored) throw new Error('token bazaga yozilmadi');
  if (createHash('sha256').update(token).digest('hex') !== stored.tokenHash) {
    throw new Error('xatdagi token bazadagi hash bilan mos emas');
  }

  return token;
}

interface MailSpy {
  sendPasswordReset: { mock: { calls: [string, string][] } };
}
