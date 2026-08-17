import { ErrorCode, FileKind, UserRole } from '@hisobai/contracts';
import { Prisma, type Shop } from '@prisma/client';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditEntry } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { readPrecondition } from '../common/optimistic-lock';
import type { RequestUser } from '../common/request-user';
import { runWithShopScope } from '../database/shop-context';
import { ShopsService } from './shops.service';

/**
 * Do'kon servisining ikkita xulqi sinaladi, chunki ikkalasi ham
 * **jimgina** buziladi:
 *
 *  - §3.10 audit diff — butun obyekt yozilsa jurnal o'qib bo'lmas
 *    bo'lib qoladi va "kim ustamani o'zgartirdi" degan savol javobsiz;
 *  - `API.md` §8 optimistik qulf — shartli `UPDATE` ishlamay qolsa,
 *    ikkinchi qurilmaning o'zgarishi bildirmasdan ustidan yoziladi.
 *
 * Har test `runWithShopScope` ichida ishlaydi — `ShopsService` endi
 * `requireShopId()` ga tayanadi (§21.7: `where: { shopId }` qo'lda
 * yozilmaydi), bu Shop kontekstisiz ishlamaydi (xuddi ishlab chiqarishda
 * `ShopContextInterceptor` ochgani kabi).
 */

const SHOP_ID = 'shop-1';

const ACTOR: RequestUser = {
  id: 'user-1',
  email: 'ega@hisobai.uz',
  displayName: "Do'kon egasi",
  role: UserRole.SHOP_ADMIN,
  theme: 'SYSTEM',
  sessionId: 'session-1',
  shopId: SHOP_ID,
} as RequestUser;

const UPDATED_AT = new Date('2026-08-10T09:30:00.123Z');

function baseRow(): Shop {
  return {
    id: SHOP_ID,
    name: 'HisobAI',
    logoFileId: null,
    address: null,
    phone: null,
    workStart: '09:00',
    workEnd: '19:00',
    weekendDays: [0],
    lowStockThreshold: 3,
    defaultInstallmentMonths: 6,
    defaultDownPaymentPercent: new Prisma.Decimal('30'),
    storeRateMarkupPercent: new Prisma.Decimal('0'),
    reminderHour: 9,
    updatedById: null,
    createdAt: UPDATED_AT,
    updatedAt: UPDATED_AT,
  } as Shop;
}

/** `where.updatedAt` — aniq sana yoki `{ lte }` (sarlavha varianti). */
function matchesFilter(actual: Date, filter: Date | { lte: Date } | undefined): boolean {
  if (filter === undefined) return true;
  if (filter instanceof Date) return actual.getTime() === filter.getTime();
  return actual.getTime() <= filter.lte.getTime();
}

interface CreateWorld {
  shops: Shop[];
  userShopId: string | null;
}

function makeService(
  initial: Shop = baseRow(),
  files: Record<string, { kind: string }> = {},
) {
  let row = initial;
  // Argumentlar tiplanadi: test audit yozuvining MAZMUNINI tekshiradi
  const audit = { record: vi.fn((_tx: unknown, _shopId: string | null, _entry: AuditEntry) => Promise.resolve()) };

  // §19.7 — boshqa Shop'ning fayli xaritada yo'q, xuddi RLS uni
  // filtrlab tashlagandek (`common/file-ref.spec.ts` asosiy tekshiruv).
  const fileAsset = {
    findFirst: ({ where }: { where: { id: string } }) =>
      Promise.resolve(files[where.id] ?? null),
  };

  const model = {
    findUniqueOrThrow: () => Promise.resolve(row),

    update: ({
      where,
      data,
    }: {
      where: { id: string; updatedAt?: Date | { lte: Date } };
      data: Record<string, unknown>;
    }) => {
      if (!matchesFilter(row.updatedAt, where.updatedAt)) {
        /**
         * Prisma shartga mos qator topmasa `P2025` beradi — va uni
         * **rad etilgan promise** sifatida beradi, sinxron `throw`
         * bilan emas. Dublyor shuni takrorlashi shart: sinxron tashlansa
         * servisdagi `.catch(...)` umuman ulanmaydi va test haqiqiy
         * xulqni sinamay qo'yadi.
         */
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
            code: 'P2025',
            clientVersion: 'test',
          }),
        );
      }
      // `@updatedAt` — Prisma har yozuvda yangilaydi
      row = { ...row, ...data, updatedAt: new Date(row.updatedAt.getTime() + 1000) } as Shop;
      return Promise.resolve(row);
    },
  };

  const prisma = {
    shop: model,
    fileAsset,
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({ shop: model, fileAsset }),
  };

  const service = new ShopsService(prisma as never, audit as never);
  return { service, audit, current: () => row };
}

/**
 * `createShop()` (§25.6, §25.7) uchun alohida qurilma — `makeService()`
 * dan farqli, bu yerda `user`, `cashCategory`, `cashAccount` delegatlari
 * ham kerak (tovuq-tuxum oqimi butun qatorni yaratadi).
 */
function makeCreateShopService(userShopId: string | null = null) {
  const world: CreateWorld = { shops: [], userShopId };
  const audit = { record: vi.fn((_tx: unknown, _shopId: string | null, _entry: AuditEntry) => Promise.resolve()) };
  const cashCategoryCreates: unknown[] = [];
  const cashAccountCreates: unknown[] = [];

  const model = {
    shop: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        const created = { ...baseRow(), ...data } as Shop;
        world.shops.push(created);
        return Promise.resolve(created);
      },
    },
    user: {
      updateMany: ({
        where,
        data,
      }: {
        where: { id: string; shopId: string | null };
        data: { shopId: string };
      }) => {
        if (where.shopId !== world.userShopId) return Promise.resolve({ count: 0 });
        world.userShopId = data.shopId;
        return Promise.resolve({ count: 1 });
      },
    },
    cashCategory: {
      create: (args: unknown) => {
        cashCategoryCreates.push(args);
        return Promise.resolve({ id: `cat-${String(cashCategoryCreates.length)}` });
      },
    },
    cashAccount: {
      create: (args: unknown) => {
        cashAccountCreates.push(args);
        return Promise.resolve({ id: `acc-${String(cashAccountCreates.length)}` });
      },
    },
  };

  const prisma = { $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(model) };
  const service = new ShopsService(prisma as never, audit as never);

  return { service, audit, world, cashCategoryCreates, cashAccountCreates };
}

/** Formadan kelgan token — forma yuklangan versiyaga bog'langan. */
function preconditionFor(updatedAt: Date) {
  return readPrecondition({ headers: {} } as unknown as Request, updatedAt.toISOString());
}

/** Har chaqiruv Shop kontekstida — `requireShopId()` shuni talab qiladi (§21.7). */
function withShop<T>(fn: () => Promise<T>): Promise<T> {
  return runWithShopScope(SHOP_ID, fn);
}

describe('ShopsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('get() — Decimal maydonlar satr sifatida chiqadi (`API.md` §2.1)', async () => {
    const { service } = makeService();

    const dto = await withShop(() => service.get());
    expect(dto.defaultDownPaymentPercent).toBe('30');
    expect(dto.storeRateMarkupPercent).toBe('0');
    expect(typeof dto.updatedAt).toBe('string');
  });

  it('§3.10 — audit’ga FAQAT o‘zgargan maydon tushadi', async () => {
    const { service, audit } = makeService();

    await withShop(() =>
      service.update(ACTOR, { storeRateMarkupPercent: '2' }, preconditionFor(UPDATED_AT), '::1'),
    );

    expect(audit.record).toHaveBeenCalledOnce();
    const entry = audit.record.mock.calls[0]?.[2];

    expect(entry?.action).toBe('SHOP_UPDATED');
    expect(entry?.before).toEqual({ storeRateMarkupPercent: '0' });
    expect(entry?.after).toEqual({ storeRateMarkupPercent: '2' });
    // O'zgarmagan maydonlar jurnalni to'ldirmaydi
    expect(Object.keys(entry?.after as Record<string, unknown>)).toHaveLength(1);
  });

  it('hech narsa o‘zgarmasa audit yozuvi yaratilmaydi', async () => {
    const { service, audit } = makeService();

    await withShop(() =>
      service.update(ACTOR, { name: 'HisobAI' }, preconditionFor(UPDATED_AT), null),
    );

    expect(audit.record).not.toHaveBeenCalled();
  });

  it('`API.md` §8 — eskirgan token bilan yozuv rad etiladi', async () => {
    const { service, current } = makeService();
    const stale = new Date(UPDATED_AT.getTime() - 5000);

    try {
      await withShop(() =>
        service.update(ACTOR, { name: 'Boshqa nom' }, preconditionFor(stale), null),
      );
      expect.unreachable('konflikt kutilgan edi');
    } catch (error) {
      const exception = error as AppException;
      expect(exception.code).toBe(ErrorCode.STALE_RESOURCE);
      expect(exception.details).toEqual({
        expectedUpdatedAt: stale.toISOString(),
        actualUpdatedAt: UPDATED_AT.toISOString(),
      });
    }

    // Eng muhimi: yozuv o'zgarmadi
    expect(current().name).toBe('HisobAI');
  });

  it('to‘g‘ri token bilan yozuv o‘tadi va `updatedAt` oldinga siljiydi', async () => {
    const { service } = makeService();

    const saved = await withShop(() =>
      service.update(ACTOR, { name: 'Yangi do‘kon' }, preconditionFor(UPDATED_AT), null),
    );

    expect(saved.name).toBe('Yangi do‘kon');
    expect(new Date(saved.updatedAt).getTime()).toBeGreaterThan(UPDATED_AT.getTime());
    expect(saved.updatedById).toBe(ACTOR.id);
  });

  it('ketma-ket ikkinchi yozuv eski token bilan o‘tmaydi', async () => {
    const { service } = makeService();
    const precondition = preconditionFor(UPDATED_AT);

    await withShop(() => service.update(ACTOR, { name: 'Birinchi' }, precondition, null));

    // O'sha tokenni qayta ishlatish — "ikki qurilma" holatining aynan o'zi
    await expect(
      withShop(() => service.update(ACTOR, { name: 'Ikkinchi' }, precondition, null)),
    ).rejects.toThrow(AppException);
  });

  // §19.7 — IDOR: boshqa Shop'ning yoki noto'g'ri `kind`dagi faylni
  // logotip sifatida biriktirib bo'lmaydi. Bu, schema izohida aytilgan,
  // kompozit FK'siz qolgan YAGONA havola — himoya faqat shu yerda.
  it('boshqa Shop’ning faylini logotip sifatida biriktirib bo‘lmaydi', async () => {
    const { service } = makeService();

    await expect(
      withShop(() =>
        service.update(
          ACTOR,
          { logoFileId: 'boshqa-shop-fayli' },
          preconditionFor(UPDATED_AT),
          null,
        ),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('noto‘g‘ri `kind`dagi faylni logotip sifatida biriktirib bo‘lmaydi', async () => {
    const { service } = makeService(baseRow(), { 'file-1': { kind: FileKind.PRODUCT_IMAGE } });

    await expect(
      withShop(() =>
        service.update(ACTOR, { logoFileId: 'file-1' }, preconditionFor(UPDATED_AT), null),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('to‘g‘ri `kind`dagi fayl logotip sifatida biriktiriladi', async () => {
    const { service } = makeService(baseRow(), { 'file-1': { kind: FileKind.SHOP_LOGO } });

    const saved = await withShop(() =>
      service.update(ACTOR, { logoFileId: 'file-1' }, preconditionFor(UPDATED_AT), null),
    );

    expect(saved.logoFileId).toBe('file-1');
  });

  it('null yuborilsa logotip olib tashlanadi va audit yoziladi', async () => {
    const initial = { ...baseRow(), logoFileId: 'old-logo-id' };
    const { service, audit } = makeService(initial);

    const saved = await withShop(() =>
      service.update(ACTOR, { logoFileId: null }, preconditionFor(UPDATED_AT), null),
    );

    expect(saved.logoFileId).toBeNull();
    expect(audit.record).toHaveBeenCalledOnce();
    const entry = audit.record.mock.calls[0]?.[2];
    expect(entry?.before).toEqual({ logoFileId: 'old-logo-id' });
    expect(entry?.after).toEqual({ logoFileId: null });
  });
});

/**
 * `createShop()` — §25.6 (setup oqimi) va §25.7 (1 SHOP_ADMIN = 1 SHOP).
 *
 * Bu yerda `withShop()` ATAYLAB ishlatilmaydi: chaqiruvchi (Shop'siz
 * SHOP_ADMIN) hech qanday ambient Shop kontekstiga ega emas — bu holat
 * `createShop()`ning o'zi `runWithShopScope(newShopId, …)` bilan
 * ichkaridan ochishi kerak (§25.6 izohidagi "tovuq-tuxum" mulohazasi).
 * `withShop()` bilan o'ralgan test bu farqni yashirib qo'yardi.
 */
describe('ShopsService.createShop — setup oqimi (§25.6, §25.7)', () => {
  const SHOPLESS_ACTOR: RequestUser = { ...ACTOR, shopId: null } as RequestUser;

  it('Shop yaratiladi, accountga biriktiriladi va boshlang‘ich kassa tuziladi', async () => {
    const { service, audit, world, cashCategoryCreates, cashAccountCreates } =
      makeCreateShopService(null);

    const dto = await service.createShop(SHOPLESS_ACTOR, { name: "Yangi do'kon" }, '::1');

    expect(dto.name).toBe("Yangi do'kon");
    expect(world.shops).toHaveLength(1);
    // §25.7 — account darhol yangi Shop'ga bog'lanadi
    expect(world.userShopId).toBe(world.shops[0]?.id);

    // §11.10 — 7 kategoriya, 3 kassa hisobi (seed.mts bilan bir xil ro'yxat)
    expect(cashCategoryCreates).toHaveLength(7);
    expect(cashAccountCreates).toHaveLength(3);

    // §21.18 emas — bu yerda Shop ALLAQACHON yaratilgan, shuning uchun
    // audit yozuvi shopId'siz EMAS, yangi Shop'ning o'zi bilan yoziladi
    expect(audit.record).toHaveBeenCalledOnce();
    expect(audit.record.mock.calls[0]?.[1]).toBe(world.shops[0]?.id);
    expect(audit.record.mock.calls[0]?.[2]?.action).toBe('SHOP_CREATED');
  });

  it("§25.7 — ikkinchi POST /shops SHOP_ALREADY_EXISTS bilan rad etiladi", async () => {
    // Actor allaqachon Shop'ga ega (`updateMany`ning `shopId: null` sharti
    // mos kelmaydi) — xuddi ikkinchi so'rov birinchisidan keyin kelgandek.
    const { service, world } = makeCreateShopService('shop-mavjud');

    await expect(
      service.createShop(SHOPLESS_ACTOR, { name: 'Ikkinchi urinish' }, null),
    ).rejects.toMatchObject({ code: ErrorCode.SHOP_ALREADY_EXISTS });

    // Account eski Shop'iga bog'langanicha qoladi — ustidan yozilmagan
    expect(world.userShopId).toBe('shop-mavjud');
  });

  it('har chaqiruvda YANGI, tasodifiy Shop id ishlatiladi (ikkinchi Shop birinchisining hisoblagichini davom ettirmaydi)', async () => {
    const first = makeCreateShopService(null);
    const second = makeCreateShopService(null);

    const dto1 = await first.service.createShop(SHOPLESS_ACTOR, { name: 'A' }, null);
    const dto2 = await second.service.createShop(SHOPLESS_ACTOR, { name: 'B' }, null);

    expect(dto1.id).not.toBe(dto2.id);
  });
});
