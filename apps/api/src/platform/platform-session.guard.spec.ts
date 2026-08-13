import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@hisobai/contracts';
import { describe, expect, it, vi } from 'vitest';

import { AppException } from '../common/app.exception';
import { PLATFORM_ONLY_KEY } from '../common/auth.decorators';
import { PlatformSessionGuard } from './platform-session.guard';
import type { AuthedPlatformRequest } from './platform-request';
import { hashSessionToken } from '../common/session-token';

const COOKIE_NAME = 'hisobai_platform_session';
const TOKEN = 'platform-test-token';

function makeGuard(
  session: unknown,
  isPlatformRoute: boolean,
): { guard: PlatformSessionGuard; context: ExecutionContext; request: AuthedPlatformRequest } {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) =>
    key === PLATFORM_ONLY_KEY ? isPlatformRoute : undefined,
  );

  const request = {} as AuthedPlatformRequest & { cookies?: Record<string, string> };
  const context = {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  const prisma = {
    platformSession: {
      findUnique: vi.fn(() => Promise.resolve(session)),
      update: vi.fn(() => Promise.resolve({})),
    },
  };
  const config = { get: () => COOKIE_NAME };

  return {
    guard: new PlatformSessionGuard(reflector, prisma as never, config as never),
    context,
    request,
  };
}

const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 1000);

describe('PlatformSessionGuard (§21.3, PERMISSIONS.md §5)', () => {
  it('@PlatformOnly() YO‘Q endpointda hech narsa qilmaydi — true qaytadi', async () => {
    const { guard, context, request } = makeGuard(null, false);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.platformAdmin).toBeUndefined();
  });

  it('@PlatformOnly() endpoint — cookie yo‘q bo‘lsa RAD ETADI (401)', async () => {
    const { guard, context } = makeGuard(null, true);
    try {
      await guard.canActivate(context);
      expect.unreachable('401 kutilgan edi');
    } catch (error) {
      expect((error as AppException).code).toBe(ErrorCode.AUTH_REQUIRED);
      expect((error as AppException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    }
  });

  it.each([
    ['muddati o‘tgan', { expiresAt: past, revokedAt: null, platformAdmin: { isActive: true } }],
    ['bekor qilingan', { expiresAt: future, revokedAt: new Date(), platformAdmin: { isActive: true } }],
    ['hisob o‘chirilgan', { expiresAt: future, revokedAt: null, platformAdmin: { isActive: false } }],
    ['topilmadi', null],
  ])('%s sessiya — RAD ETADI (401), request.platformAdmin to‘ldirilmaydi', async (_name, session) => {
    const { guard, context, request } = makeGuard(
      session === null ? null : { id: 'psession-1', lastSeenAt: new Date(), ...session },
      true,
    );
    request.cookies = { [COOKIE_NAME]: TOKEN };

    try {
      await guard.canActivate(context);
      expect.unreachable('401 kutilgan edi');
    } catch (error) {
      expect((error as AppException).code).toBe(ErrorCode.AUTH_SESSION_EXPIRED);
    }
    expect(request.platformAdmin).toBeUndefined();
  });

  it('haqiqiy sessiya — request.platformAdmin to‘ldiriladi, token hash bo‘yicha qidiriladi', async () => {
    const session = {
      id: 'psession-1',
      expiresAt: future,
      revokedAt: null,
      lastSeenAt: new Date(),
      platformAdmin: { id: 'admin-1', email: 'superadmin@hisobai.uz', displayName: 'SA', isActive: true },
    };
    const { guard, context, request } = makeGuard(session, true);
    request.cookies = { [COOKIE_NAME]: TOKEN };

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.platformAdmin).toEqual({
      id: 'admin-1',
      email: 'superadmin@hisobai.uz',
      displayName: 'SA',
      sessionId: 'psession-1',
    });
  });

  it('business SessionGuard bilan bir xil naqsh — token ochiq emas, hash bo‘yicha qidiriladi', async () => {
    const session = {
      id: 'psession-1',
      expiresAt: future,
      revokedAt: null,
      lastSeenAt: new Date(),
      platformAdmin: { id: 'admin-1', email: 'a@a.uz', displayName: 'A', isActive: true },
    };
    const reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const request = { cookies: { [COOKIE_NAME]: TOKEN } } as unknown as AuthedPlatformRequest;
    const context = {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const findUnique = vi.fn(() => Promise.resolve(session));
    const guard = new PlatformSessionGuard(
      reflector,
      { platformSession: { findUnique, update: vi.fn() } } as never,
      { get: () => COOKIE_NAME } as never,
    );

    await guard.canActivate(context);

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashSessionToken(TOKEN) } }),
    );
  });
});
