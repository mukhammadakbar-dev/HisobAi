import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  ProductType,
  buildDisplayName,
  type CreateProductInput,
  type Page,
  type ProductDto,
  type ProductQuery,
  type ProductStockDto,
  type UpdateProductInput,
} from '@hisobai/contracts';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { auditDiff, hasChanges } from '../common/audit-diff';
import { staleResource, type Precondition } from '../common/optimistic-lock';
import { normalizeLimit, toPage, toPrismaCursor } from '../common/pagination';
import { isForeignKeyViolation, isRecordNotFound } from '../common/prisma-errors';
import { containsInsensitive } from '../common/search';
import type { RequestUser } from '../common/request-user';
import { PrismaService } from '../database/prisma.service';
import { ShopsService } from '../shops/shops.service';

/**
 * Mahsulot shabloni (§4.1–§4.8).
 *
 * Shablon **fizik narsa emas**: tannarx bu yerda saqlanmaydi (§4.1), u
 * ombor birligida yoki partiyada turadi. Shu yerdagi `lastCostPrice`
 * faqat qabul formasini oldindan to'ldirish uchun (§4.2) va u qabul
 * qilishda yangilanadi — `InventoryReceivingService` da.
 */

/** Prisma `include` — DTO uchun kategoriya va brend nomlari kerak. */
const WITH_TAXONOMY = {
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
} as const;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof WITH_TAXONOMY }>;

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly shops: ShopsService,
  ) {}

  // ──────────────────────────── O'qish ────────────────────────────

  async list(query: ProductQuery): Promise<Page<ProductDto>> {
    const limit = normalizeLimit(query.limit);
    const [column, direction] = parseSort(query.sort);

    const rows = await this.prisma.product.findMany({
      where: buildWhere(query),
      // `id` ikkilamchi tartib — bir xil nomli qatorlarda sahifa chegarasi
      // beqaror bo'lib, yozuv ikki marta chiqmasin
      orderBy: [{ [column]: direction }, { id: direction }],
      include: WITH_TAXONOMY,
      ...toPrismaCursor(query.cursor, limit),
    });

    const stock = await this.stockOf(rows);

    return toPage(
      rows.map((row) => toDto(row, stock.get(row.id) ?? EMPTY_STOCK)),
      limit,
      (dto) => (column === 'displayName' ? dto.displayName : dto.createdAt),
    );
  }

  async requireById(id: string): Promise<ProductDto> {
    const row = await this.prisma.product.findUnique({ where: { id }, include: WITH_TAXONOMY });
    if (!row) throw AppException.notFound(ErrorCode.NOT_FOUND, 'Mahsulot topilmadi.');

    const stock = await this.stockOf([row]);
    return toDto(row, stock.get(row.id) ?? EMPTY_STOCK);
  }

  // ──────────────────────────── Yozish ────────────────────────────

  async create(
    input: CreateProductInput,
    actor: RequestUser,
    ip: string | null,
  ): Promise<ProductDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      const brand = await requireTaxonomy(tx, 'brand', input.brandId, true);
      await requireTaxonomy(tx, 'category', input.categoryId, true);

      const displayName = buildDisplayName({
        brandName: brand.name,
        model: input.model,
        storage: input.storage,
        color: input.color,
      });
      await this.reserveName(tx, displayName, null);

      return tx.product
        .create({
          data: {
            categoryId: input.categoryId,
            brandId: input.brandId,
            model: input.model,
            storage: input.storage,
            color: input.color,
            displayName,
            type: input.type,
            currency: input.currency,
            suggestedPrice: toDecimal(input.suggestedPrice),
            lowStockThreshold: input.lowStockThreshold,
            description: input.description,
          },
          include: WITH_TAXONOMY,
        })
        .catch((error: unknown) => {
          // Kategoriya yoki brend tekshiruv bilan `INSERT` orasida
          // o'chirilgan bo'lsa (amalda deyarli imkonsiz — ular
          // arxivlanadi, o'chirilmaydi) 500 o'rniga ma'noli xato
          if (isForeignKeyViolation(error)) throw taxonomyGone();
          throw error;
        });
    });

    await this.audit.recordDetached({
      actorId: actor.id,
      action: 'PRODUCT_CREATED',
      entityType: 'Product',
      entityId: created.id,
      after: auditView(created),
      ip,
    });

    // Yangi mahsulotda ombor bo'sh — so'rovsiz ham ma'lum
    return toDto(created, EMPTY_STOCK);
  }

  /**
   * Tahrirlash va arxivlash (§4.8).
   *
   * Uchta tekshiruv shu yerda yig'ilgan, chunki ularning har biri
   * jimgina buzadigan holatni to'sadi:
   *
   *  1. **Nom qayta yig'iladi** (§4.6) — model, xotira, rang yoki brend
   *     o'zgarsa. Aks holda qidiruv eski nom bo'yicha ishlab qolardi.
   *  2. **Ombor bo'sh emas → `type` va `currency` qotadi.** Tannarx
   *     valyutasi triggeri faqat yozish paytida ishlaydi, ya'ni
   *     mahsulotni USD dan UZS ga o'tkazish mavjud qatorlarni jimgina
   *     noto'g'ri qoldirardi (`CATALOG_PRODUCT_HAS_STOCK`).
   *  3. **Arxivdagi kategoriya/brendga o'tkazib bo'lmaydi** — faqat
   *     qiymat o'zgarganda, izohga qarang: `CATALOG_TAXONOMY_ARCHIVED`.
   */
  async update(
    id: string,
    input: UpdateProductInput,
    precondition: Precondition,
    actor: RequestUser,
    ip: string | null,
  ): Promise<ProductDto> {
    const after = await this.prisma.$transaction(async (tx) => {
      const before = await tx.product.findUnique({ where: { id }, include: WITH_TAXONOMY });
      if (!before) throw AppException.notFound(ErrorCode.NOT_FOUND, 'Mahsulot topilmadi.');

      if (input.categoryId !== undefined && input.categoryId !== before.categoryId) {
        await requireTaxonomy(tx, 'category', input.categoryId, true);
      }

      // Brend nomi nomni qayta yig'ish uchun har doim kerak: o'zgarmagan
      // bo'lsa ham `before` dagi nom ishlatiladi
      const brand =
        input.brandId !== undefined && input.brandId !== before.brandId
          ? await requireTaxonomy(tx, 'brand', input.brandId, true)
          : before.brand;

      await this.assertNoStockWhenLocked(tx, id, input, before);

      const displayName = buildDisplayName({
        brandName: brand.name,
        model: input.model ?? before.model,
        storage: input.storage !== undefined ? input.storage : before.storage,
        color: input.color !== undefined ? input.color : before.color,
      });
      if (displayName !== before.displayName) {
        await this.reserveName(tx, displayName, id);
      }

      // `updatedAt` `WHERE` da — tekshiruv va yozuv bitta atomik amal (§17.5 naqshi)
      const updated = await tx.product
        .update({
          where: { id, updatedAt: precondition.updatedAt },
          data: { ...toPrismaData(input), displayName },
          include: WITH_TAXONOMY,
        })
        .catch(async (error: unknown) => {
          if (isForeignKeyViolation(error)) throw taxonomyGone();
          if (!isRecordNotFound(error)) throw error;

          const current = await tx.product.findUnique({ where: { id } });
          throw staleResource(current?.updatedAt ?? before.updatedAt, precondition.expected);
        });

      const changes = auditDiff(auditView(before), auditView(updated));
      if (hasChanges(changes)) {
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'PRODUCT_UPDATED',
          entityType: 'Product',
          entityId: id,
          before: changes.before,
          after: changes.after,
          ip,
        });
      }

      return updated;
    });

    const stock = await this.stockOf([after]);
    return toDto(after, stock.get(after.id) ?? EMPTY_STOCK);
  }

  // ──────────────────────── Ichki yordamchilar ────────────────────────

  /**
   * §3.8 — qoldiq va "kam qoldiq" belgisi.
   *
   * Seriyalida `AVAILABLE` birliklar soni, miqdorlida partiya qoldiqlari
   * yig'indisi. Ikkala hisob ham **guruhlangan bitta so'rov** bilan
   * olinadi: ro'yxatdagi har mahsulot uchun alohida so'rov yuborilsa,
   * 50 qatorli sahifa 100 ta so'rovga aylanardi.
   */
  private async stockOf(rows: StockSource[]): Promise<Map<string, StockCount>> {
    const serialized = rows.filter((row) => row.type === ProductType.SERIALIZED).map((r) => r.id);
    const quantity = rows.filter((row) => row.type === ProductType.QUANTITY).map((r) => r.id);
    const result = new Map<string, StockCount>();
    if (rows.length === 0) return result;

    const [items, batches, settings] = await Promise.all([
      serialized.length > 0
        ? this.prisma.inventoryItem.groupBy({
            by: ['productId'],
            where: { productId: { in: serialized }, status: 'AVAILABLE' },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      quantity.length > 0
        ? this.prisma.inventoryBatch.groupBy({
            by: ['productId'],
            where: { productId: { in: quantity } },
            _sum: { quantityRemaining: true },
          })
        : Promise.resolve([]),
      this.shops.get(),
    ]);

    for (const group of items) {
      result.set(group.productId, { available: group._count._all });
    }
    for (const group of batches) {
      result.set(group.productId, { available: group._sum.quantityRemaining ?? 0 });
    }

    for (const row of rows) {
      const available = result.get(row.id)?.available ?? 0;
      // §3.8 — mahsulotning o'z chegarasi, u yo'q bo'lsa umumiy chegara
      const threshold = row.lowStockThreshold ?? settings.lowStockThreshold;
      result.set(row.id, { available, threshold });
    }

    return result;
  }

  /**
   * Nomni band qiladi va dublikatni to'sadi (§4.3 ruhi mahsulotga ham).
   *
   * **Nega advisory lock.** `products.display_name` da unique indeks
   * yo'q, ya'ni "avval `SELECT`, keyin `INSERT`" — TOCTOU poygasi:
   * `READ COMMITTED` da ikkita parallel so'rov bir-birining hali commit
   * qilinmagan qatorini ko'rmaydi va ikkalasi ham o'tib ketardi (§17.5
   * aynan shu naqshni rad etgan). `pg_advisory_xact_lock` bir xil nom
   * uchun tranzaksiyalarni ketma-ketlashtiradi — IMEI triggeridagi
   * mexanizmning o'zi.
   *
   * Kalit kichik harfga keltiriladi: "iPhone 15" va "iphone 15" bitta
   * qulfga tushsin. Solishtiruv ham `insensitive` — ikkisi ajralmasin.
   *
   * `$executeRaw`, `$queryRaw` emas: `pg_advisory_xact_lock` `void`
   * qaytaradi va Prisma uni ustun sifatida o'qiy olmaydi
   * ("Failed to deserialize column of type 'void'").
   */
  private async reserveName(
    tx: Prisma.TransactionClient,
    displayName: string,
    excludeId: string | null,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${displayName.toLowerCase()}))`;

    const existing = await tx.product.findFirst({
      where: {
        displayName: { equals: displayName, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, isActive: true },
    });
    if (!existing) return;

    throw AppException.conflict(
      ErrorCode.CATALOG_DUPLICATE_NAME,
      existing.isActive
        ? 'Bunday mahsulot allaqachon bor.'
        : 'Bunday mahsulot arxivda bor — uni tiklang yoki boshqa nom tanlang.',
      { existingId: existing.id, isActive: existing.isActive },
    );
  }

  /** Ombor bo'sh emas bo'lsa `type` va `currency` qotadi — izoh `update` da. */
  private async assertNoStockWhenLocked(
    tx: Prisma.TransactionClient,
    id: string,
    input: UpdateProductInput,
    before: { type: string; currency: string },
  ): Promise<void> {
    const currencyChanged = input.currency !== undefined && input.currency !== before.currency;
    const typeChanged = input.type !== undefined && input.type !== before.type;
    if (!currencyChanged && !typeChanged) return;

    const [items, batches] = await Promise.all([
      tx.inventoryItem.count({ where: { productId: id } }),
      tx.inventoryBatch.count({ where: { productId: id } }),
    ]);
    if (items + batches === 0) return;

    throw AppException.rule(
      ErrorCode.CATALOG_PRODUCT_HAS_STOCK,
      currencyChanged
        ? "Bu mahsulotda ombor yozuvlari bor — valyutani o'zgartirib bo'lmaydi."
        : "Bu mahsulotda ombor yozuvlari bor — turini o'zgartirib bo'lmaydi.",
      currencyChanged ? 'currency' : 'type',
      { inventoryItemCount: items, batchCount: batches },
    );
  }
}

// ────────────────────────── Tiplar va yordamchilar ──────────────────────────

interface StockCount {
  available: number;
  /** `undefined` — chegara hali hisoblanmagan (yangi mahsulot, ombor bo'sh). */
  threshold?: number;
}

/** Qoldiq hisobi uchun kerakli minimal maydonlar. */
interface StockSource {
  id: string;
  type: string;
  lowStockThreshold: number | null;
}

const EMPTY_STOCK: StockCount = { available: 0 };

function taxonomyGone(): AppException {
  return AppException.rule(
    ErrorCode.NOT_FOUND,
    'Tanlangan kategoriya yoki brend topilmadi. Sahifani yangilang.',
    'categoryId',
  );
}

/**
 * Kategoriya yoki brend mavjudligini (va kerak bo'lsa faolligini)
 * tekshiradi.
 *
 * Xato **422 va maydon nomi bilan** qaytadi, `404` emas: bu forma
 * tanlovidagi muammo va u aynan o'sha `<select>` yonida ko'rinishi kerak
 * (`FRONTEND.md` §5.2). `404` esa butun sahifani "topilmadi" holatiga
 * o'tkazardi.
 */
async function requireTaxonomy(
  tx: Prisma.TransactionClient,
  kind: 'category' | 'brand',
  id: string,
  mustBeActive: boolean,
): Promise<{ id: string; name: string }> {
  const field = kind === 'category' ? 'categoryId' : 'brandId';
  const label = kind === 'category' ? 'Kategoriya' : 'Brend';

  const row =
    kind === 'category'
      ? await tx.category.findUnique({
          where: { id },
          select: { id: true, name: true, isActive: true },
        })
      : await tx.brand.findUnique({
          where: { id },
          select: { id: true, name: true, isActive: true },
        });

  if (!row) {
    throw AppException.rule(ErrorCode.NOT_FOUND, `${label} topilmadi.`, field);
  }
  if (mustBeActive && !row.isActive) {
    throw AppException.rule(
      ErrorCode.CATALOG_TAXONOMY_ARCHIVED,
      `${label} arxivda — avval uni tiklang yoki boshqasini tanlang.`,
      field,
    );
  }
  return { id: row.id, name: row.name };
}

function buildWhere(query: ProductQuery): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};

  if (query.isActive !== 'all') where.isActive = query.isActive === 'active';
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.brandId) where.brandId = query.brandId;
  if (query.type) where.type = query.type;
  // `products_display_name_trgm_idx` aynan shu qidiruv uchun qo'yilgan
  // Joker belgilar oddiy belgiga aylanadi — izoh `common/search.ts` da
  if (query.q) where.displayName = containsInsensitive(query.q);

  return where;
}

function parseSort(sort: ProductQuery['sort']): ['displayName' | 'createdAt', 'asc' | 'desc'] {
  if (sort === 'createdAt') return ['createdAt', 'asc'];
  if (sort === '-createdAt') return ['createdAt', 'desc'];
  return ['displayName', sort === '-displayName' ? 'desc' : 'asc'];
}

// `Unchecked` — `categoryId`/`brandId` skalyar FK sifatida yoziladi
function toPrismaData(input: UpdateProductInput): Prisma.ProductUncheckedUpdateInput {
  const data: Prisma.ProductUncheckedUpdateInput = {};

  if (input.categoryId !== undefined) data.categoryId = input.categoryId;
  if (input.brandId !== undefined) data.brandId = input.brandId;
  if (input.model !== undefined) data.model = input.model;
  if (input.storage !== undefined) data.storage = input.storage;
  if (input.color !== undefined) data.color = input.color;
  if (input.type !== undefined) data.type = input.type;
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.suggestedPrice !== undefined) data.suggestedPrice = toDecimal(input.suggestedPrice);
  if (input.lowStockThreshold !== undefined) data.lowStockThreshold = input.lowStockThreshold;
  if (input.description !== undefined) data.description = input.description;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  return data;
}

/** Pul satrdan `Decimal` ga — oraliqda `number` bo'lib qolmaydi (§17.14). */
function toDecimal(value: string | null | undefined): Prisma.Decimal | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Prisma.Decimal(value);
}

/** Audit uchun soddalashtirilgan ko'rinish — `Decimal` satrga aylanadi. */
function auditView(row: ProductRow): Record<string, unknown> {
  return {
    displayName: row.displayName,
    categoryId: row.categoryId,
    brandId: row.brandId,
    model: row.model,
    storage: row.storage,
    color: row.color,
    type: row.type,
    currency: row.currency,
    suggestedPrice: row.suggestedPrice?.toString() ?? null,
    lowStockThreshold: row.lowStockThreshold,
    description: row.description,
    isActive: row.isActive,
  };
}

function toStockDto(stock: StockCount): ProductStockDto {
  return {
    available: stock.available,
    // Chegara nolga teng bo'lsa "kam qoldiq" faqat ombor bo'sh bo'lganda
    isLowStock: stock.available <= (stock.threshold ?? 0),
  };
}

export function toDto(row: ProductRow, stock: StockCount): ProductDto {
  return {
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    brandId: row.brandId,
    brandName: row.brand.name,
    model: row.model,
    storage: row.storage,
    color: row.color,
    displayName: row.displayName,
    type: row.type,
    currency: row.currency,
    // Decimal → satr (`API.md` §2.1)
    suggestedPrice: row.suggestedPrice?.toString() ?? null,
    lastCostPrice: row.lastCostPrice?.toString() ?? null,
    lowStockThreshold: row.lowStockThreshold,
    description: row.description,
    isActive: row.isActive,
    stock: toStockDto(stock),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
