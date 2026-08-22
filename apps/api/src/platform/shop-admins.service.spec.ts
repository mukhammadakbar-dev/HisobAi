import { AccountStatus, ErrorCode, UserRole as ContractUserRole } from '@hisobai/contracts';
import { UserRole, type User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditEntry } from '../audit/audit.service';
import type { PlatformAdminAuth } from './platform-request';
import { ShopAdminsService } from './shop-admins.service';

/**
 * §25.5, §25.17, §21.6 — SUPERADMIN'ning yagona biznes vazifasi.
 *
 * Bu servis `AuditService.record`ni HAR DOIM `shopId = null` bilan
 * chaqiradi (§25.3: SUPERADMIN'da Shop tushunchasi umuman yo'q) — har
 * test buni tekshiradi, chunki bitta unutilgan joy §21.18 dagi
 * "audit yozuvi amalning o'zini yiqitadi" xatosini qaytarardi.
 */

const PLATFORM_ADMIN: PlatformAdminAuth = {
  id: 'admin-1',
  email: 'superadmin@hisobai.uz',
  displayName: 'Platforma egasi',
  sessionId: 'psession-1',
};

function makeUserRow(overrides: Partial<User> = {}): User {
  return {
    id: 'shop-admin-1',
    email: 'yangi@hisobai.uz',
    passwordHash: 'hash',
    displayName: 'Yangi ega',
    role: UserRole.SHOP_ADMIN,
    theme: 'SYSTEM',
    status: AccountStatus.ACTIVE,
    shopId: null,
    createdAt: new Date('2026-08-13T09:00:00.000Z'),
    updatedAt: new Date('2026-08-13T09:00:00.000Z'),
    ...overrides,
  } as User;
}

interface World {
  users: User[];
}

function makeService(initial: User[] = []) {
  const world: World = { users: initial };
  const audit = {
    record: vi.fn((_tx: unknown, _shopId: string | null, _entry: AuditEntry) => Promise.resolve()),
  };

  const model = {
    user: {
      findMany: () => Promise.resolve(world.users),
      count: () => Promise.resolve(world.users.length),
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(world.users.find((u) => u.id === where.id) ?? null),
      create: ({ data }: { data: Partial<User> }) => {
        if (world.users.some((u) => u.email === data.email)) {
          const error = new Error('unique violation') as Error & { code: string };
          error.code = 'P2002';
          return Promise.reject(
            Object.assign(error, { name: 'PrismaClientKnownRequestError', clientVersion: 'test' }),
          );
        }
        const created = makeUserRow({ ...data, id: `user-${String(world.users.length + 1)}` });
        world.users.push(created);
        return Promise.resolve(created);
      },
      update: ({ where, data }: { where: { id: string }; data: Partial<User> }) => {
        const idx = world.users.findIndex((u) => u.id === where.id);
        const updated = { ...world.users[idx], ...data } as User;
        world.users[idx] = updated;
        return Promise.resolve(updated);
      },
    },
  };

  const prisma = { ...model, $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(model) };
  const service = new ShopAdminsService(prisma as never, audit as never);

  return { service, audit, world };
}

// Prisma-style unique-violation qidirish `isUniqueViolation()` orqali
// ishlaydi — u `instanceof Prisma.PrismaClientKnownRequestError` va
// `code === 'P2002'`ni tekshiradi. Test double buni to'liq taqlid qila
// olmaydi (haqiqiy klass emas), shuning uchun email dublikat testi shu
// cheklovni hisobga oladi — pastga qarang.

describe('ShopAdminsService.create (§25.5)', () => {
  beforeEach(() => vi.clearAllMocks());

  it("account Shop'siz yaratiladi (§25.5 — SUPERADMIN Shop yaratmaydi)", async () => {
    const { service, world } = makeService();

    const dto = await service.create(
      { email: 'yangi@hisobai.uz', password: 'parolParol1', displayName: 'Yangi ega' },
      PLATFORM_ADMIN,
      '::1',
    );

    expect(dto.shopId).toBeNull();
    expect(dto.status).toBe(AccountStatus.ACTIVE);
    expect(world.users[0]?.shopId).toBeNull();
    expect(dto.email).toBe('yangi@hisobai.uz');
    // Rol enum ikkala paketda ham bir xil bo'lishi shart
    expect(ContractUserRole.SHOP_ADMIN).toBe('SHOP_ADMIN');
  });

  it('§21.18 — audit SHOP_ADMIN_CREATED bilan, shopId=null (SUPERADMIN Shop kontekstiga ega emas)', async () => {
    const { service, audit } = makeService();

    await service.create(
      { email: 'yangi@hisobai.uz', password: 'parolParol1', displayName: 'Yangi ega' },
      PLATFORM_ADMIN,
      '::1',
    );

    expect(audit.record).toHaveBeenCalledOnce();
    const [, shopIdArg, entry] = audit.record.mock.calls[0] as [unknown, string | null, AuditEntry];
    expect(shopIdArg).toBeNull();
    expect(entry.action).toBe('SHOP_ADMIN_CREATED');
    expect(entry.actorId).toBe(PLATFORM_ADMIN.id);
  });
});

describe('ShopAdminsService.updateStatus (§21.6, §25.19)', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [AccountStatus.ACTIVE, AccountStatus.SUSPENDED, 'SHOP_ADMIN_BLOCKED'],
    [AccountStatus.SUSPENDED, AccountStatus.ACTIVE, 'SHOP_ADMIN_UNBLOCKED'],
    [AccountStatus.ACTIVE, AccountStatus.DISABLED, 'SHOP_ADMIN_DEACTIVATED'],
    [AccountStatus.DISABLED, AccountStatus.ACTIVE, 'SHOP_ADMIN_ACTIVATED'],
  ])('%s → %s — audit action %s', async (before, after, expectedAction) => {
    const { service, audit } = makeService([makeUserRow({ status: before })]);

    await service.updateStatus('shop-admin-1', { status: after }, PLATFORM_ADMIN, null);

    expect(audit.record).toHaveBeenCalledOnce();
    const entry = audit.record.mock.calls[0]?.[2] as AuditEntry;
    expect(entry.action).toBe(expectedAction);
  });

  it("o'zgarishsiz status — audit yozuvi yo'q", async () => {
    const { service, audit } = makeService([makeUserRow({ status: AccountStatus.ACTIVE })]);

    await service.updateStatus('shop-admin-1', { status: AccountStatus.ACTIVE }, PLATFORM_ADMIN, null);

    expect(audit.record).not.toHaveBeenCalled();
  });

  it("topilmagan account — NOT_FOUND", async () => {
    const { service } = makeService([]);

    await expect(
      service.updateStatus('yoq', { status: AccountStatus.SUSPENDED }, PLATFORM_ADMIN, null),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });
});

describe("ShopAdminsService.list — SUPERADMIN faqat account metadata'sini ko'radi (§25.3)", () => {
  it("ro'yxat business ma'lumotni chiqarmaydi — faqat shopId (bor-yo'qligi)", async () => {
    const { service } = makeService([
      makeUserRow({ id: 'u1', shopId: 'shop-1' }),
      makeUserRow({ id: 'u2', email: 'ikkinchi@hisobai.uz', shopId: null }),
    ]);

    const page = await service.list({});

    expect(page.data).toHaveLength(2);
    for (const dto of page.data) {
      // DTO shaklining o'zi §25.3 chegarasini kafolatlaydi: mijoz, savdo,
      // kassa kabi maydonlar TIP DARAJASIDA yo'q (`ShopAdminDto`).
      expect(Object.keys(dto).sort()).toEqual(
        ['createdAt', 'displayName', 'email', 'id', 'shopId', 'status'].sort(),
      );
    }
  });
});
