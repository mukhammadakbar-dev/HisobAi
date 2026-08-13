import { describe, expect, it, vi } from 'vitest';

import { ErrorCode } from '@hisobai/contracts';

import { decideOperation } from '../database/prisma.service';
import { getShopId, isNoShopScope, runWithShopScope } from '../database/shop-context';
import { AuditService } from './audit.service';

/**
 * §21.18 — Shop'siz hisobning account amali audit qilinganda tranzaksiya
 * BUTUNLAY yiqilmasligi kerak. Bu fayl ikki narsani sinaydi:
 *
 *  1. `AuditService.record`/`recordDetached` haqiqiy ambient kontekstni
 *     (`runWithShopScope`/`runWithoutShopScope`, MOCK EMAS) to'g'ri
 *     o'rnatadi — `tx.auditLog.create` chaqirilgan payt qanday kontekstda
 *     turganini `getShopId()`/`isNoShopScope()` bilan to'g'ridan-to'g'ri
 *     o'qib tekshiradi.
 *  2. `decideOperation` (haqiqiy funksiya, `database/prisma.service.ts`)
 *     bilan birga: implementatsiyadan OLDINGI xato reproduktsiya
 *     qilinadi (kontekstsiz `AuditLog` yozuvi `SHOP_CONTEXT_MISSING`
 *     tashlaydi) va `AuditService.record(tx, null, …)` buni aylanib
 *     o'tishini isbotlaydi.
 */

/**
 * Prisma'ning haqiqiy qaytargan qiymati "lazy" — `$allOperations` ichidagi
 * ish faqat `.then()` chaqirilganda boshlanadi (`prisma.service.ts`dagi
 * `withShopScope` izohiga qarang). Oddiy `vi.fn(() => Promise.resolve(...))`
 * buni USHLAMAYDI: `Promise.resolve()` DARHOL "hal qilingan" holatda, ya'ni
 * ambient kontekstni `fn()` chaqirilgan payt sinxron o'qib olsa ham, xato
 * (haqiqiy Prisma bilan) yashiringan bo'lardi. Shuning uchun bu yordamchi
 * ataylab AMBIENTNI `.then()` chaqirilgan paytda (mikrovazifa ichida) o'qiydi
 * — bu implementatsiya paytida **haqiqiy serverga qarshi** topilgan xatoni
 * (`AuditService.record`da `await` `runWithShopScope`/`runWithoutShopScope`
 * chaqiruvi ICHIDA emas, TASHQARIDA bo'lgani) qayta ushlab turadigan
 * yagona yo'l — mock darhol ishlasa, bu xato hech qachon "qizarmaydi".
 */
function lazyThenable<T>(resolve: () => T): PromiseLike<T> {
  return {
    then<TResult1 = T, TResult2 = never>(
      onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
      onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      // `resolve()` ATAYLAB mikrovazifa ichida — `then()` chaqirilgan
      // paytda, undan oldin emas. Zanjirning qolgani oddiy promise
      // semantikasi: `resolve()` xato tashlasa u `onRejected`ga tushadi.
      return Promise.resolve()
        .then(() => resolve())
        .then(onFulfilled, onRejected);
    },
  };
}

function makeTx(): { auditLog: { create: ReturnType<typeof vi.fn> }; captured: unknown[] } {
  const captured: unknown[] = [];
  return {
    captured,
    auditLog: {
      create: vi.fn((args: unknown) =>
        lazyThenable(() => {
          captured.push({ shopId: getShopId(), noScope: isNoShopScope(), args });
          return { id: 'log-1' };
        }),
      ),
    },
  };
}

describe('AuditService.record — ambient kontekst (§21.18)', () => {
  it('shopId === null → yozuv runWithoutShopScope() ichida bajariladi', async () => {
    const tx = makeTx();
    const service = new AuditService({} as never);

    await service.record(tx as never, null, {
      actorId: 'admin-1',
      action: 'SHOP_ADMIN_CREATED',
      entityType: 'User',
    });

    expect(tx.auditLog.create).toHaveBeenCalledOnce();
    expect(tx.captured).toEqual([{ shopId: null, noScope: true, args: expect.anything() }]);
  });

  it('shopId berilsa → yozuv aynan o‘sha Shop konteksti ichida bajariladi', async () => {
    const tx = makeTx();
    const service = new AuditService({} as never);

    await service.record(tx as never, 'shop-1', {
      actorId: 'user-1',
      action: 'SALE_CONFIRMED',
      entityType: 'Sale',
    });

    expect(tx.captured).toEqual([{ shopId: 'shop-1', noScope: false, args: expect.anything() }]);
  });

  it('shopId berilgan kontekst ambient allaqachon boshqa qiymatda bo‘lsa ham ustidan yozadi', async () => {
    const tx = makeTx();
    const service = new AuditService({} as never);

    // `resetPassword` kabi @Public() yo'llarda ambient hech qachon
    // ochilmaydi — bu yerda ataylab boshqa Shop konteksti ichida
    // chaqirilib, `record()` aynan o'ziga berilgan qiymatni ishlatishini
    // (ambientga ISHONMASLIGINI) tasdiqlaymiz.
    await runWithShopScope('boshqa-shop', async () => {
      await service.record(tx as never, 'nishon-shop', {
        actorId: 'user-1',
        action: 'PASSWORD_RESET',
        entityType: 'User',
      });
    });

    expect(tx.captured).toEqual([
      { shopId: 'nishon-shop', noScope: false, args: expect.anything() },
    ]);
  });
});

describe('AuditService.recordDetached — ambient kontekst', () => {
  it('shopId === null → runWithoutShopScope() ichida bajariladi', async () => {
    const captured: unknown[] = [];
    const prisma = {
      auditLog: {
        create: vi.fn(() =>
          lazyThenable(() => {
            captured.push({ shopId: getShopId(), noScope: isNoShopScope() });
            return { id: 'log-1' };
          }),
        ),
      },
    };
    const service = new AuditService(prisma as never);

    await service.recordDetached(null, {
      actorId: 'user-1',
      action: 'SESSION_REVOKED',
      entityType: 'Session',
    });

    expect(captured).toEqual([{ shopId: null, noScope: true }]);
  });
});

/**
 * Implementatsiyadan OLDINGI xatoni reproduktsiya qiladi: `AuditLog`
 * model shop-scoped (`SHOP_SCOPE_EXEMPT_MODELS`da YO'Q), shuning uchun
 * ambient kontekst umuman yo'q bo'lganda oddiy yozuv `SHOP_CONTEXT_MISSING`
 * bilan qulaydi — aynan shu narsa Shop'siz `SHOP_ADMIN` parolini
 * o'zgartirganda `AuditService`ning eski (shopId'siz) shaklida sodir
 * bo'lardi va BUTUN tranzaksiyani (parol o'zgarishini) rollback qilardi.
 */
describe('§21.18 — regressiya: AuditLog yozuvi endi kontekstsiz ham qulamaydi', () => {
  it('decideOperation to‘g‘ridan-to‘g‘ri: kontekstsiz AuditLog SHOP_CONTEXT_MISSING beradi', async () => {
    await expect(
      decideOperation('AuditLog', 'create', {
        runDirect: vi.fn(() => Promise.resolve('should-not-run')),
        runWrapped: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: ErrorCode.SHOP_CONTEXT_MISSING });
  });

  it('AuditService.record(tx, null, …) buni runWithoutShopScope() bilan aylanib o‘tadi', async () => {
    // `tx.auditLog.create` shu yerda haqiqiy `decideOperation`ga ulanadi —
    // eski (shopId'siz) kodda bu chaqiruv `runDirect` chaqirilishidan
    // OLDIN SHOP_CONTEXT_MISSING bilan qulagan bo'lardi.
    const tx = {
      auditLog: {
        create: (args: unknown) =>
          decideOperation('AuditLog', 'create', {
            runDirect: () => Promise.resolve({ id: 'log-1', ...(args as object) }),
            runWrapped: () => Promise.reject(new Error('runWrapped chaqirilmasligi kerak edi')),
          }),
      },
    };
    const service = new AuditService({} as never);

    await expect(
      service.record(tx as never, null, {
        actorId: 'admin-1',
        action: 'PASSWORD_CHANGED',
        entityType: 'User',
      }),
    ).resolves.toBeUndefined();
  });
});
