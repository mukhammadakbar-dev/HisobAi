import { APP_GUARD } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { AppModule } from '../app.module';
import { PlatformSessionGuard } from '../platform/platform-session.guard';
import { RolesGuard } from './roles.guard';
import { SessionGuard } from './session.guard';

/**
 * Guard tartibi — **xavfsizlik invarianti, uslub emas** (§21.3,
 * `ARCHITECTURE.md` §14.3).
 *
 * `roles.guard.ts` `@PlatformOnly()` endpointda `true` qaytaradi va
 * "ruxsat qarori `PlatformSessionGuard`da allaqachon qabul qilingan"
 * deb hisoblaydi. Bu faraz **faqat** `PlatformSessionGuard` undan OLDIN
 * ro'yxatdan o'tgan bo'lsa to'g'ri.
 *
 * Tartib buzilsa nima bo'ladi: `RolesGuard` birinchi ishlaydi,
 * `@PlatformOnly()` ni ko'rib `true` qaytaradi, so'rov o'tib ketadi va
 * `PlatformSessionGuard` umuman chaqirilmaydi — ya'ni **butun
 * `/platform/*` paneli, jumladan SHOP_ADMIN account yaratish, hech
 * qanday autentifikatsiyasiz ochiq** bo'lib qoladi. Ilova ishlashda
 * davom etadi, hech qaerda xato chiqmaydi va bitta test ham qizarmaydi
 * — aynan shuning uchun bu yerda alohida test bor.
 *
 * Xuddi shu mulohaza `SessionGuard` → `RolesGuard` juftligiga ham
 * tegishli: `RolesGuard` `request.user`ga tayanadi, uni esa
 * `SessionGuard` to'ldiradi (`app.module.ts`dagi izoh).
 */
describe('Guard tartibi — app.module.ts APP_GUARD ro’yxati', () => {
  function guardOrder(): unknown[] {
    const providers = Reflect.getMetadata('providers', AppModule) as
      | { provide?: unknown; useClass?: unknown }[]
      | undefined;

    expect(providers, 'AppModule providers metadata topilmadi').toBeDefined();

    return (providers ?? [])
      .filter((provider) => provider.provide === APP_GUARD)
      .map((provider) => provider.useClass);
  }

  it('PlatformSessionGuard RolesGuard dan OLDIN keladi', () => {
    const order = guardOrder();
    const platform = order.indexOf(PlatformSessionGuard);
    const roles = order.indexOf(RolesGuard);

    expect(platform, 'PlatformSessionGuard APP_GUARD ro’yxatida yo’q').toBeGreaterThanOrEqual(0);
    expect(roles, 'RolesGuard APP_GUARD ro’yxatida yo’q').toBeGreaterThanOrEqual(0);
    expect(platform).toBeLessThan(roles);
  });

  it('SessionGuard RolesGuard dan OLDIN keladi', () => {
    const order = guardOrder();
    expect(order.indexOf(SessionGuard)).toBeLessThan(order.indexOf(RolesGuard));
  });

  it('RolesGuard — oxirgi guard (yagona rad etish nuqtasi)', () => {
    const order = guardOrder();
    expect(order.at(-1)).toBe(RolesGuard);
  });
});
