import type {
  CashAccountDto,
  CashCategoryDto,
  CashEntryDto,
  CashExchangeDto,
} from '@hisobai/contracts';
import { CashSourceType } from '@hisobai/contracts';
import type { CashAccount, CashCategory, CashEntry, CashExchange, Prisma } from '@prisma/client';

import { businessDay } from '../common/dates';

export const ENTRY_INCLUDE = {
  account: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
} satisfies Prisma.CashEntryInclude;

type EntryWithRefs = Prisma.CashEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;

export function toAccountDto(account: CashAccount): CashAccountDto {
  return {
    id: account.id,
    name: account.name,
    currency: account.currency,
    kind: account.kind,
    isActive: account.isActive,
    sortOrder: account.sortOrder,
    updatedAt: account.updatedAt.toISOString(),
  };
}

export function toCategoryDto(category: CashCategory): CashCategoryDto {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    direction: category.direction,
    isSystem: category.isSystem,
    isActive: category.isActive,
  };
}

export function toEntryDto(entry: EntryWithRefs, timeZone: string, now: Date): CashEntryDto {
  return {
    id: entry.id,
    accountId: entry.accountId,
    accountName: entry.account.name,
    direction: entry.direction,
    // Decimal → satr (`API.md` §2.1)
    amount: entry.amount.toString(),
    currency: entry.currency,
    occurredAt: entry.occurredAt.toISOString(),
    categoryId: entry.categoryId,
    categoryName: entry.category?.name ?? null,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    paymentId: entry.paymentId,
    note: entry.note,
    attachmentFileId: entry.attachmentFileId,
    editable: isEditable(entry, timeZone, now),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export function toExchangeDto(exchange: CashExchange): CashExchangeDto {
  return {
    id: exchange.id,
    fromAccountId: exchange.fromAccountId,
    toAccountId: exchange.toAccountId,
    fromAmount: exchange.fromAmount.toString(),
    toAmount: exchange.toAmount.toString(),
    rate: exchange.rate.toString(),
    occurredAt: exchange.occurredAt.toISOString(),
    note: exchange.note,
  };
}

/**
 * §11.7 va §11.8 birgalikda: avtomatik yozuv **hech qachon**,
 * qo'lda kiritilgani esa **faqat kiritilgan kuni** tahrirlanadi.
 *
 * Kun `createdAt` bo'yicha, `occurredAt` bo'yicha emas: 7 kun orqaga
 * qo'yilgan yozuv aks holda tug'ilishidanoq "eskirgan" bo'lib, hech
 * qachon tuzatib bo'lmasdi.
 *
 * UI shu bayroqqa qarab tugmani ko'rsatadi; server baribir qaytadan
 * tekshiradi (`assertEditable`).
 */
function isEditable(entry: CashEntry, timeZone: string, now: Date): boolean {
  if (entry.sourceType !== CashSourceType.MANUAL) return false;
  return businessDay(entry.createdAt, timeZone) === businessDay(now, timeZone);
}
