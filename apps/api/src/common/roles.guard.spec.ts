import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, Theme, UserRole } from '@hisobai/contracts';
import { describe, expect, it, vi } from 'vitest';

import { AppException } from './app.exception';
import { PUBLIC_KEY, ROLES_KEY, SHOP_EXEMPT_KEY } from './auth.decorators';
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

function makeGuard(metadata: {
  public?: boolean;
  roles?: UserRole[];
  shopExempt?: boolean;
}): RolesGuard {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) => {
    if (key === PUBLIC_KEY) return metadata.public;
    if (key === ROLES_KEY) return metadata.roles;
    if (key === SHOP_EXEMPT_KEY) return metadata.shopExempt;
    return undefined;
  });
  return new RolesGuard(reflector);
}

const owner: RequestUser = {
  id: 'user-1',
  email: 'ega@hisobai.uz',
  displayName: "Do'kon egasi",
  role: UserRole.SHOP_ADMIN,
  theme: Theme.SYSTEM,
  sessionId: 'session-1',
  shopId: 'shop-1',
};

const shopLessOwner: RequestUser = { ...owner, shopId: null };

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
    const guard = makeGuard({ roles: [UserRole.SHOP_ADMIN] });
    try {
      guard.canActivate(makeContext());
      expect.unreachable('401 kutilgan edi');
    } catch (error) {
      expect((error as AppException).code).toBe(ErrorCode.AUTH_REQUIRED);
      expect((error as AppException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    }
  });

  it("mos rol bilan o'tadi", () => {
    const guard = makeGuard({ roles: [UserRole.SHOP_ADMIN] });
    expect(guard.canActivate(makeContext(owner))).toBe(true);
  });

  it("ro'yxatda yo'q rol rad etiladi", () => {
    // Kelajakda MANAGER/SELLER qo'shilganda shu yo'l ishlaydi
    const guard = makeGuard({ roles: ['MANAGER' as UserRole] });
    expect(() => guard.canActivate(makeContext(owner))).toThrow(AppException);
  });
});

/**
 * §21.10, §14.8 — Shop'siz account "ruxsati yo'q" emas, "hali sozlanmagan".
 * Bu ikkisi turli xato kodi va turli HTTP status bilan ajratiladi —
 * frontend faqat shu farq bo'yicha `/app/setup-shop`ga yo'naltira oladi.
 */
describe("RolesGuard — Shop'siz account (§21.10)", () => {
  it('shop-scoped endpoint (default) Shop’siz accountga SHOP_SETUP_REQUIRED, 409 qaytaradi', () => {
    const guard = makeGuard({ roles: [UserRole.SHOP_ADMIN] });
    try {
      guard.canActivate(makeContext(shopLessOwner));
      expect.unreachable('409 kutilgan edi');
    } catch (error) {
      expect((error as AppException).code).toBe(ErrorCode.SHOP_SETUP_REQUIRED);
      expect((error as AppException).getStatus()).toBe(HttpStatus.CONFLICT);
    }
  });

  it('@ShopExempt() endpoint Shop’siz accountga ham ochiq', () => {
    const guard = makeGuard({ roles: [UserRole.SHOP_ADMIN], shopExempt: true });
    expect(guard.canActivate(makeContext(shopLessOwner))).toBe(true);
  });

  it('Shop biriktirilgan accountda shop-scoped endpoint erkin o‘tadi', () => {
    const guard = makeGuard({ roles: [UserRole.SHOP_ADMIN] });
    expect(guard.canActivate(makeContext(owner))).toBe(true);
  });

  it('rol mos kelmasa, Shop tekshiruviga yetib borilmaydi — 403 birinchi', () => {
    // Tartib muhim: avval rol, keyin Shop (`RolesGuard`dagi izohga qarang).
    // Aks holda ruxsati yo'q foydalanuvchi ham "Shop sozlang" deb
    // chalg'itilardi.
    const guard = makeGuard({ roles: ['MANAGER' as UserRole] });
    try {
      guard.canActivate(makeContext(shopLessOwner));
      expect.unreachable('403 kutilgan edi');
    } catch (error) {
      expect((error as AppException).code).toBe(ErrorCode.FORBIDDEN);
    }
  });
});
