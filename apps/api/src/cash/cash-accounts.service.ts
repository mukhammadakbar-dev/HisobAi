import { Injectable } from '@nestjs/common';
import {
  CashDirection,
  ErrorCode,
  sumMoney,
  type CashAccountDto,
  type CashBalanceDto,
  type CashCategoryDto,
  type Currency,
  type CreateCashAccountInput,
  type CreateCashCategoryInput,
  type UpdateCashAccountInput,
} from '@hisobai/contracts';
import { CashSourceType } from '@hisobai/contracts';
import type { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { auditDiff, hasChanges } from '../common/audit-diff';
import { staleResource, type Precondition } from '../common/optimistic-lock';
import { isRecordNotFound, isUniqueViolation } from '../common/prisma-errors';
import type { RequestUser } from '../common/request-user';
import { PrismaService } from '../database/prisma.service';
import { toAccountDto, toCategoryDto } from './cash.mappers';

/**
 * Kassa hisoblari va kategoriyalari (§11.1, §11.10).
 *
 * Hisob **o'chirilmaydi** — `isActive: false` bilan yopiladi. Sabab
 * yozuvlarda: hisob o'chirilsa, undagi kirim-chiqim tarixi ham
 * yo'qolardi, ya'ni o'tgan kunlarning kassa hisoboti o'zgarib ketardi.
 * Bu §11.7 dagi "avtomatik yozuv tahrirlanmaydi" qoidasining o'sha
 * mantiqi, faqat bir daraja yuqorida.
 */
@Injectable()
export class CashAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listAccounts(includeInactive: boolean): Promise<CashAccountDto[]> {
    const accounts = await this.prisma.cashAccount.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return accounts.map(toAccountDto);
  }

  /**
   * Hisoblar + qoldiqlar (§11.3).
   *
   * Qoldiq **saqlanmaydi, hisoblanadi**: saqlangan qoldiq har yozuvda
   * yangilanishi kerak bo'lardi va bitta o'tkazib yuborilgan yangilanish
   * uni jimgina yolg'onga aylantirardi. Yig'indi bazada (`groupBy`)
   * hisoblanadi — barcha yozuvlarni Node'ga tortib kelish kun bo'yi
   * ishlagan do'konda ma'nosiz og'irlik.
   */
  async listBalances(includeInactive: boolean): Promise<CashBalanceDto[]> {
    const accounts = await this.prisma.cashAccount.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const grouped = await this.prisma.cashEntry.groupBy({
      by: ['accountId', 'direction'],
      _sum: { amount: true },
    });

    const opening = await this.prisma.cashEntry.findMany({
      where: { sourceType: CashSourceType.OPENING_BALANCE },
      select: { accountId: true },
    });
    const withOpening = new Set(opening.map((row) => row.accountId));

    return accounts.map((account) => {
      const inflow =
        grouped
          .find((row) => row.accountId === account.id && row.direction === CashDirection.IN)
          ?._sum.amount?.toString() ?? '0';
      const outflow =
        grouped
          .find((row) => row.accountId === account.id && row.direction === CashDirection.OUT)
          ?._sum.amount?.toString() ?? '0';

      return {
        ...toAccountDto(account),
        // Ayirish `sumMoney` orqali: butun ilovada bitta pul arifmetikasi
        // qolsin (§17.14) — `Number` bilan hisoblangan qoldiq bir kun
        // serverdagi `Decimal` yig'indisidan ajralib ketardi
        balance: sumMoney([inflow, `-${outflow}`], account.currency),
        hasOpeningBalance: withOpening.has(account.id),
      };
    });
  }

  async createAccount(
    input: CreateCashAccountInput,
    actor: RequestUser,
    ip: string | null,
  ): Promise<CashAccountDto> {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.cashAccount
        .create({
          data: {
            name: input.name,
            currency: input.currency,
            kind: input.kind,
            sortOrder: input.sortOrder ?? 0,
          },
        })
        .catch((error: unknown) => {
          // `@@unique([name, currency])` — "Naqd UZS" ikkita bo'lsa,
          // yozuv qaysi biriga tushgani hech qachon aniq bo'lmasdi
          if (isUniqueViolation(error)) {
            throw AppException.conflict(
              ErrorCode.CATALOG_DUPLICATE_NAME,
              'Bu nom va valyuta bilan hisob allaqachon bor.',
            );
          }
          throw error;
        });

      await this.audit.record(tx, actor.shopId, {
        actorId: actor.id,
        action: 'CASH_ACCOUNT_CREATED',
        entityType: 'CashAccount',
        entityId: account.id,
        after: { name: account.name, currency: account.currency, kind: account.kind },
        ip,
      });

      return toAccountDto(account);
    });
  }

  async updateAccount(
    id: string,
    input: UpdateCashAccountInput,
    precondition: Precondition,
    actor: RequestUser,
    ip: string | null,
  ): Promise<CashAccountDto> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.cashAccount.findUnique({ where: { id } });
      if (!before) throw accountNotFound();

      const data: Prisma.CashAccountUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

      const after = await tx.cashAccount
        // Qulf `WHERE` ichida — TOCTOU poygasi shu bilan yopiladi (`API.md` §8)
        .update({ where: { id, updatedAt: precondition.updatedAt }, data })
        .catch(async (error: unknown) => {
          if (isRecordNotFound(error)) {
            const current = await tx.cashAccount.findUnique({ where: { id } });
            throw staleResource(current?.updatedAt ?? before.updatedAt, precondition.expected);
          }
          if (isUniqueViolation(error)) {
            throw AppException.conflict(
              ErrorCode.CATALOG_DUPLICATE_NAME,
              'Bu nom va valyuta bilan hisob allaqachon bor.',
            );
          }
          throw error;
        });

      const diff = auditDiff(before, after, ['name', 'isActive', 'sortOrder']);
      if (hasChanges(diff)) {
        await this.audit.record(tx, actor.shopId, {
          actorId: actor.id,
          action: 'CASH_ACCOUNT_UPDATED',
          entityType: 'CashAccount',
          entityId: id,
          before: diff.before,
          after: diff.after,
          ip,
        });
      }

      return toAccountDto(after);
    });
  }

  // ──────────────────────────── Kategoriyalar ────────────────────────────

  async listCategories(): Promise<CashCategoryDto[]> {
    const categories = await this.prisma.cashCategory.findMany({
      where: { isActive: true },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return categories.map(toCategoryDto);
  }

  async createCategory(
    input: CreateCashCategoryInput,
    actor: RequestUser,
    ip: string | null,
  ): Promise<CashCategoryDto> {
    const slug = toSlug(input.name);

    return this.prisma.$transaction(async (tx) => {
      const category = await tx.cashCategory
        .create({
          data: {
            name: input.name,
            slug,
            direction: input.direction ?? null,
            // §11.10 — tizim kategoriyalari seed'da yaratiladi va
            // o'chirilmaydi; qo'lda qo'shilgani oddiy kategoriya
            isSystem: false,
          },
        })
        .catch((error: unknown) => {
          if (isUniqueViolation(error)) {
            throw AppException.conflict(
              ErrorCode.CATALOG_DUPLICATE_NAME,
              'Bunday nomli kategoriya allaqachon bor.',
            );
          }
          throw error;
        });

      await this.audit.record(tx, actor.shopId, {
        actorId: actor.id,
        action: 'CASH_CATEGORY_CREATED',
        entityType: 'CashCategory',
        entityId: category.id,
        after: { name: category.name, direction: category.direction },
        ip,
      });

      return toCategoryDto(category);
    });
  }

  /** Yozuv yaratishda ishlatiladi — hisob bor va faolmi. */
  async requireActiveAccount(
    tx: Prisma.TransactionClient,
    id: string,
    field: string,
  ): Promise<{ id: string; currency: Currency; name: string }> {
    const account = await tx.cashAccount.findUnique({
      where: { id },
      select: { id: true, currency: true, name: true, isActive: true },
    });
    if (!account) throw accountNotFound(field);
    if (!account.isActive) {
      throw AppException.rule(ErrorCode.VALIDATION_FAILED, 'Bu hisob yopilgan.', field);
    }
    return { id: account.id, currency: account.currency, name: account.name };
  }
}

function accountNotFound(field?: string): AppException {
  return field
    ? AppException.rule(ErrorCode.NOT_FOUND, 'Kassa hisobi topilmadi.', field)
    : AppException.notFound(ErrorCode.NOT_FOUND, 'Kassa hisobi topilmadi.');
}

/**
 * Kategoriya `slug` i — `@unique` ustun.
 *
 * Foydalanuvchi nomni istalgancha yozadi ("Ijara", "ijara "), lekin
 * ikkita bir xil kategoriya hisobotni ikkiga bo'lib yuborardi.
 */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/['`’]/g, '')
    .replace(/[^a-z0-9Ѐ-ӿ]+/g, '-')
    .replace(/^-|-$/g, '');
}
