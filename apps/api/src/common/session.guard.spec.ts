import { ExecutionContext } from '@nestjs/common';
import { Theme, UserRole } from '@hisobai/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { AuthedRequest } from './request-user';
import { SessionGuard } from './session.guard';
import { hashSessionToken } from './session-token';

/**
 * `SessionGuard` — kirish nazoratining birinchi bo'g'ini.
 *
 * Ikkita invariant sinaladi:
 *  1. Yaroqsiz sessiya HECH QACHON `request.user` ni to'ldirmaydi;
 *  2. Guard rad etmaydi — u faqat aniqlaydi. Rad etish `RolesGuard` da,
 *     aks holda eskirgan cookie bilan `/auth/login` ham yopilib qolardi.
 */

const COOKIE_NAME = 'hisobai_session';
const TOKEN = 'test-token';

const activeUser = {
  id: 'user-1',
  email: 'ega@hisobai.uz',
  displayName: "Do'kon egasi",
  role: UserRole.OWNER,
  theme: Theme.SYSTEM,
  isActive: true,
};

function makeContext(cookies: Record<string, string>): {
  context: ExecutionContext;
  request: AuthedRequest;
} {
  const request = { cookies } as unknown as AuthedRequest;
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

function makeGuard(session: unknown): { guard: SessionGuard; update: ReturnType<typeof vi.fn> } {
  const update = vi.fn(() => Promise.resolve({}));
  const prisma = {
    session: {
      findUnique: vi.fn(() => Promise.resolve(session)),
      update,
    },
  };
  const config = { get: () => COOKIE_NAME };
  return { guard: new SessionGuard(prisma as never, config as never), update };
}

const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 1000);

describe('SessionGuard', () => {
  it("cookie yo'q — foydalanuvchi ham yo'q, lekin so'rov o'tadi", async () => {
    const { guard } = makeGuard(null);
    const { context, request } = makeContext({});

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
    expect(request.sessionExpired).toBeUndefined();
  });

  it('haqiqiy sessiya — foydalanuvchi to‘ldiriladi', async () => {
    const { guard } = makeGuard({
      id: 'session-1',
      expiresAt: future,
      revokedAt: null,
      lastSeenAt: new Date(),
      user: activeUser,
    });
    const { context, request } = makeContext({ [COOKIE_NAME]: TOKEN });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      id: 'user-1',
      role: UserRole.OWNER,
      sessionId: 'session-1',
    });
  });

  it('token hash bo‘yicha qidiriladi — ochiq token bazada yo‘q', async () => {
    const session = {
      id: 'session-1',
      expiresAt: future,
      revokedAt: null,
      lastSeenAt: new Date(),
      user: activeUser,
    };
    const findUnique = vi.fn(() => Promise.resolve(session));
    const guard = new SessionGuard(
      { session: { findUnique, update: vi.fn() } } as never,
      { get: () => COOKIE_NAME } as never,
    );

    await guard.canActivate(makeContext({ [COOKIE_NAME]: TOKEN }).context);

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashSessionToken(TOKEN) } }),
    );
  });

  it.each([
    ['muddati o‘tgan', { expiresAt: past, revokedAt: null, user: activeUser }],
    ['bekor qilingan', { expiresAt: future, revokedAt: new Date(), user: activeUser }],
    [
      'hisob o‘chirilgan',
      { expiresAt: future, revokedAt: null, user: { ...activeUser, isActive: false } },
    ],
    ['topilmadi', null],
  ])('%s sessiya — foydalanuvchi to‘ldirilmaydi', async (_name, session) => {
    const { guard } = makeGuard(
      session === null ? null : { id: 'session-1', lastSeenAt: new Date(), ...session },
    );
    const { context, request } = makeContext({ [COOKIE_NAME]: TOKEN });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
    // RolesGuard shu belgiga qarab "Sessiya tugadi" deb aytadi
    expect(request.sessionExpired).toBe(true);
  });

  it('lastSeenAt tez-tez yozilmaydi', async () => {
    const { guard, update } = makeGuard({
      id: 'session-1',
      expiresAt: future,
      revokedAt: null,
      lastSeenAt: new Date(), // hozirgina
      user: activeUser,
    });

    await guard.canActivate(makeContext({ [COOKIE_NAME]: TOKEN }).context);
    expect(update).not.toHaveBeenCalled();
  });

  it('lastSeenAt eskirgan bo‘lsa yangilanadi', async () => {
    const { guard, update } = makeGuard({
      id: 'session-1',
      expiresAt: future,
      revokedAt: null,
      lastSeenAt: new Date(Date.now() - 10 * 60_000),
      user: activeUser,
    });

    await guard.canActivate(makeContext({ [COOKIE_NAME]: TOKEN }).context);
    expect(update).toHaveBeenCalledOnce();
  });
});
