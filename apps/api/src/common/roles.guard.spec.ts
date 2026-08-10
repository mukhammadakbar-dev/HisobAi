import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, Theme, UserRole } from '@hisobai/contracts';
import { describe, expect, it, vi } from 'vitest';

import { AppException } from './app.exception';
import { PUBLIC_KEY, ROLES_KEY } from './auth.decorators';
import { RolesGuard, type RequestUser } from './roles.guard';

/**
 * Bu testlar `PERMISSIONS.md` §1 dagi **default DENY** invariantini
 * ushlab turadi. Uni buzish — endpointni jimgina hammaga ochib qo'yish,
 * ya'ni eng qimmat xavfsizlik xatosi.
 */
function makeContext(user?: RequestUser): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function makeGuard(metadata: { public?: boolean; roles?: UserRole[] }): RolesGuard {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) => {
    if (key === PUBLIC_KEY) return metadata.public;
    if (key === ROLES_KEY) return metadata.roles;
    return undefined;
  });
  return new RolesGuard(reflector);
}

const owner: RequestUser = {
  id: 'user-1',
  email: 'ega@hisobai.uz',
  displayName: "Do'kon egasi",
  role: UserRole.OWNER,
  theme: Theme.SYSTEM,
  sessionId: 'session-1',
};

describe('RolesGuard — default DENY', () => {
  it("dekoratorsiz endpoint YOPIQ (foydalanuvchi bo'lsa ham)", () => {
    const guard = makeGuard({});
    try {
      guard.canActivate(makeContext(owner));
      expect.unreachable('403 kutilgan edi');
    } catch (error) {
      expect((error as AppException).code).toBe(ErrorCode.FORBIDDEN);
      expect((error as AppException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    }
  });

  it("bo'sh @Roles() ham yopiq", () => {
    const guard = makeGuard({ roles: [] });
    expect(() => guard.canActivate(makeContext(owner))).toThrow(AppException);
  });

  it('@Public() ochadi — foydalanuvchisiz ham', () => {
    const guard = makeGuard({ public: true });
    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it("foydalanuvchi yo'q → 401, 403 emas", () => {
    // Autentifikatsiya avtorizatsiyadan oldin: foydalanuvchiga "kiring"
    // deyish kerak, "ruxsat yo'q" emas.
    const guard = makeGuard({ roles: [UserRole.OWNER] });
    try {
      guard.canActivate(makeContext());
      expect.unreachable('401 kutilgan edi');
    } catch (error) {
      expect((error as AppException).code).toBe(ErrorCode.AUTH_REQUIRED);
      expect((error as AppException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    }
  });

  it("mos rol bilan o'tadi", () => {
    const guard = makeGuard({ roles: [UserRole.OWNER] });
    expect(guard.canActivate(makeContext(owner))).toBe(true);
  });

  it("ro'yxatda yo'q rol rad etiladi", () => {
    // Kelajakda MANAGER/SELLER qo'shilganda shu yo'l ishlaydi
    const guard = makeGuard({ roles: ['MANAGER' as UserRole] });
    expect(() => guard.canActivate(makeContext(owner))).toThrow(AppException);
  });
});
