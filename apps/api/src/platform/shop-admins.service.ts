import { Injectable } from '@nestjs/common';
import { AccountStatus, ErrorCode } from '@hisobai/contracts';
import type {
  CreateShopAdminInput,
  Page,
  ShopAdminDto,
  ShopAdminQuery,
  UpdateShopAdminStatusInput,
} from '@hisobai/contracts';
import { UserRole, type User } from '@prisma/client';

import { hashPassword } from '../auth/password';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { normalizeLimit, toPage, toPrismaCursor } from '../common/pagination';
import { isUniqueViolation } from '../common/prisma-errors';
import { PrismaService } from '../database/prisma.service';
import type { PlatformAdminAuth } from './platform-request';

/**
 * SHOP_ADMIN account boshqaruvi (§25.3, §25.5, §25.17, §21.6).
 *
 * **Business ma'lumotga tegilmaydi** — bu servis faqat `users` jadvali
 * bilan ishlaydi (§25.3 chegarasi). `User` model `SHOP_SCOPE_EXEMPT_MODELS`
 * ro'yxatida (`prisma.service.ts`): u Auth Shop konteksti mavjud bo'lishidan
 * OLDIN o'qiydi, ya'ni bu yerda RLS/Shop kontekstiga umuman hojat yo'q —
 * `this.prisma.user.*` chaqiruvlari to'g'ridan-to'g'ri ishlaydi.
 *
 * **Shop yaratilmaydi** (§25.5, §25.6) — `shopId: null` bilan yaratiladi,
 * SHOP_ADMIN keyin `POST /shops` orqali o'ziga Shop biriktiradi.
 */
@Injectable()
export class ShopAdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ShopAdminQuery): Promise<Page<ShopAdminDto>> {
    const limit = normalizeLimit(query.limit);

    const where = { role: UserRole.SHOP_ADMIN };
    const [rows, totalCount] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toPrismaCursor(query.cursor, limit),
      }),
      this.prisma.user.count({ where }),
    ]);

    return toPage(rows.map(toDto), limit, (dto) => dto.createdAt, totalCount);
  }

  async getById(id: string): Promise<ShopAdminDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== UserRole.SHOP_ADMIN) throw notFound();
    return toDto(user);
  }

  /**
   * §25.5 — SUPERADMIN account yaratadi, Shop'ni EMAS.
   *
   * `email` `@@unique` — dublikat `INSERT` ushlanadi, TOCTOU poygasi
   * (avval `SELECT`, keyin `INSERT`) bilan emas (§17.5 bilan bir xil naqsh).
   */
  async create(
    input: CreateShopAdminInput,
    actor: PlatformAdminAuth,
    ip: string | null,
  ): Promise<ShopAdminDto> {
    const passwordHash = await hashPassword(input.password);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user
        .create({
          data: {
            email: input.email,
            passwordHash,
            displayName: input.displayName,
            role: UserRole.SHOP_ADMIN,
            // `shopId` YOZILMAYDI — ustun default'i allaqachon `null`
            // (§21.10). Bu yerda qo'shimcha tasdiq: `shopId: null` deb
            // AYTIB YOZISH ham to'g'ri bo'lardi, lekin ustun `Unchecked`
            // create tipida ixtiyoriy — ataylab qoldiriladi, keyin
            // kimdir "nega bu yerda aniq null bor-u, boshqa joyda yo'q"
            // deb o'ylab yurmasin.
          },
        })
        .catch((error: unknown) => {
          if (isUniqueViolation(error)) {
            throw AppException.conflict(
              ErrorCode.SHOP_ADMIN_EMAIL_TAKEN,
              'Bu email bilan hisob allaqachon bor.',
            );
          }
          throw error;
        });

      // §25.17, §21.18 — SUPERADMIN'da Shop konteksti umuman yo'q,
      // shuning uchun `shopId` argumenti har doim `null`: `AuditService`
      // yozuvni `runWithoutShopScope()` ichida bajaradi.
      await this.audit.record(tx, null, {
        actorId: actor.id,
        action: 'SHOP_ADMIN_CREATED',
        entityType: 'User',
        entityId: created.id,
        after: { email: created.email, displayName: created.displayName },
        ip,
      });

      return toDto(created);
    });
  }

  /** §21.6, §25.19 — yagona status. */
  async updateStatus(
    id: string,
    input: UpdateShopAdminStatusInput,
    actor: PlatformAdminAuth,
    ip: string | null,
  ): Promise<ShopAdminDto> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id } });
      if (!before || before.role !== UserRole.SHOP_ADMIN) throw notFound();

      if (before.status === input.status) {
        // O'zgarishsiz `PATCH` — audit yozuvi yo'q (`shops.service.ts`
        // dagi "faqat o'zgargan maydon" naqshi bilan bir xil mulohaza).
        return toDto(before);
      }

      const after = await tx.user.update({
        where: { id },
        data: { status: input.status },
      });

      await this.audit.record(tx, null, {
        actorId: actor.id,
        action: statusChangeAction(before.status, after.status),
        entityType: 'User',
        entityId: id,
        before: { status: before.status },
        after: { status: after.status },
        ip,
      });

      return toDto(after);
    });
  }
}

function notFound(): AppException {
  return AppException.notFound(ErrorCode.NOT_FOUND, 'SHOP_ADMIN topilmadi.');
}

/**
 * §21.6 ikkita ilgarigi mustaqil tushunchani (faollik va blok) bitta
 * `AccountStatus`ga birlashtirdi, lekin §25.17 hali ham beshta alohida
 * audit action talab qiladi. Xarita: `DISABLED` — doimiyroq "o'chirish",
 * `SUSPENDED` — vaqtinchalik "bloklash". `ACTIVE`ga qaytish qaysi
 * holatdan kelganiga qarab ikkiga ajraladi — "qayta faollashtirish"
 * (o'chirilgandan) va "blokdan chiqarish" (bloklangandan) bir xil amal
 * emas, jurnalda farqlanishi kerak.
 */
function statusChangeAction(before: AccountStatus, after: AccountStatus): string {
  if (after === AccountStatus.ACTIVE) {
    return before === AccountStatus.SUSPENDED ? 'SHOP_ADMIN_UNBLOCKED' : 'SHOP_ADMIN_ACTIVATED';
  }
  if (after === AccountStatus.SUSPENDED) return 'SHOP_ADMIN_BLOCKED';
  return 'SHOP_ADMIN_DEACTIVATED';
}

function toDto(user: User): ShopAdminDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    shopId: user.shopId,
    createdAt: user.createdAt.toISOString(),
  };
}
