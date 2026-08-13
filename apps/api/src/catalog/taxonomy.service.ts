import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  buildDisplayName,
  slugifyCatalogName,
  type Page,
  type TaxonomyDto,
  type TaxonomyMergeResultDto,
  type TaxonomyQuery,
} from '@hisobai/contracts';
import type { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { auditDiff, hasChanges } from '../common/audit-diff';
import { normalizeLimit, toPage, toPrismaCursor } from '../common/pagination';
import { staleResource, type Precondition } from '../common/optimistic-lock';
import { isRecordNotFound, isUniqueViolation } from '../common/prisma-errors';
import { containsInsensitive } from '../common/search';
import type { RequestUser } from '../common/request-user';
import { PrismaService } from '../database/prisma.service';

/**
 * Kategoriya va brend (§4.3, §4.4).
 *
 * Ikkala jadval **bir xil shaklda** (`id`, `name`, `slug`, `isActive`),
 * shuning uchun mantiq bitta joyda yoziladi. Ayniqsa birlashtirish:
 * uni ikki marta yozish — bir kun ikkitasining biri tuzatilib, ikkinchisi
 * eskirib qolishi demak.
 */

export type TaxonomyKind = 'category' | 'brand';

/** UI va audit uchun o'zbekcha nom. */
const KIND_LABEL: Record<TaxonomyKind, string> = {
  category: 'Kategoriya',
  brand: 'Brend',
};

const AUDIT_ENTITY: Record<TaxonomyKind, string> = {
  category: 'Category',
  brand: 'Brand',
};

/**
 * Birlashtirilgan yozuvning slug'iga qo'shiladigan qo'shimcha.
 *
 * `slug` ustunida `@unique` bor va uning `isActive` sharti yo'q, ya'ni
 * arxivlangan "Aplle" nomni **garovda ushlab qoladi** — to'g'ri yozilgan
 * "Apple" ni qayta yaratib bo'lmasdi. Birlashtirishda slug bo'shatiladi.
 */
function mergedSlug(slug: string, id: string): string {
  return `${slug}--merged-${id.slice(0, 8)}`;
}

@Injectable()
export class TaxonomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ──────────────────────────── O'qish ────────────────────────────

  async list(kind: TaxonomyKind, query: TaxonomyQuery): Promise<Page<TaxonomyDto>> {
    const limit = normalizeLimit(query.limit);
    const where = buildWhere(query);
    const [column, direction] = parseSort(query.sort);

    const rows = await this.delegate(kind).findMany({
      where,
      // `id` ikkilamchi tartib — bir xil nomli qatorlarda sahifa
      // chegarasi beqaror bo'lib, yozuv ikki marta chiqmasin
      orderBy: [{ [column]: direction }, { id: direction }],
      include: { _count: { select: { products: true } } },
      ...toPrismaCursor(query.cursor, limit),
    });

    return toPage(rows.map(toDto), limit, (dto) => (column === 'name' ? dto.name : dto.createdAt));
  }

  async requireById(kind: TaxonomyKind, id: string): Promise<TaxonomyDto> {
    const row = await this.delegate(kind).findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });

    if (!row) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, `${KIND_LABEL[kind]} topilmadi.`);
    }
    return toDto(row);
  }

  // ──────────────────────────── Yozish ────────────────────────────

  /**
   * §4.3 — dublikat oldi olinadi. Nom `slug` ga normallashtiriladi
   * (`slugifyCatalogName`), unique indeks esa to'qnashuvni to'sadi.
   */
  async create(
    kind: TaxonomyKind,
    name: string,
    actor: RequestUser,
    ip: string | null,
  ): Promise<TaxonomyDto> {
    const slug = slugifyCatalogName(name);

    const created = await this.delegate(kind)
      .create({
        data: { name, slug },
        include: { _count: { select: { products: true } } },
      })
      .catch(async (error: unknown) => {
        if (!isUniqueViolation(error)) throw error;
        throw await this.duplicateName(kind, slug);
      });

    await this.audit.recordDetached(actor.shopId, {
      actorId: actor.id,
      action: `${AUDIT_ENTITY[kind].toUpperCase()}_CREATED`,
      entityType: AUDIT_ENTITY[kind],
      entityId: created.id,
      after: { name: created.name, slug: created.slug },
      ip,
    });

    return toDto(created);
  }

  /**
   * Nomni o'zgartirish yoki arxivlash (§4.8).
   *
   * **Brend nomi o'zgarsa** mahsulot nomlari qayta yig'iladi (§4.6).
   * Kategoriya nomi o'zgarganda — yo'q: §4.6 formulasida kategoriya
   * qatnashmaydi, ya'ni har doim aynan o'sha satr yozilardi.
   */
  async update(
    kind: TaxonomyKind,
    id: string,
    input: { name?: string; isActive?: boolean },
    precondition: Precondition,
    actor: RequestUser,
    ip: string | null,
  ): Promise<TaxonomyDto> {
    return this.prisma.$transaction(
      async (tx) => {
        const model = this.delegate(kind, tx);
        const before = await model.findUnique({
          where: { id },
          include: { _count: { select: { products: true } } },
        });

        if (!before) {
          throw AppException.notFound(ErrorCode.NOT_FOUND, `${KIND_LABEL[kind]} topilmadi.`);
        }

        const data: { name?: string; slug?: string; isActive?: boolean } = {};
        if (input.name !== undefined) {
          data.name = input.name;
          data.slug = slugifyCatalogName(input.name);
        }
        if (input.isActive !== undefined) data.isActive = input.isActive;

        // `updatedAt` `WHERE` da — tekshiruv va yozuv bitta atomik amal (§17.5 naqshi)
        const after = await model
          .update({
            where: { id, updatedAt: precondition.updatedAt },
            data,
            include: { _count: { select: { products: true } } },
          })
          .catch(async (error: unknown) => {
            if (isUniqueViolation(error)) {
              throw await this.duplicateName(kind, data.slug ?? before.slug);
            }
            if (!isRecordNotFound(error)) throw error;

            const current = await model.findUnique({ where: { id } });
            throw staleResource(current?.updatedAt ?? before.updatedAt, precondition.expected);
          });

        if (kind === 'brand' && data.name !== undefined && data.name !== before.name) {
          await this.rebuildProductNames(tx, { brandId: id }, after.name);
        }

        const changes = auditDiff(
          { name: before.name, slug: before.slug, isActive: before.isActive },
          { name: after.name, slug: after.slug, isActive: after.isActive },
        );
        if (hasChanges(changes)) {
          await this.audit.record(tx, actor.shopId, {
            actorId: actor.id,
            action: `${AUDIT_ENTITY[kind].toUpperCase()}_UPDATED`,
            entityType: AUDIT_ENTITY[kind],
            entityId: id,
            before: changes.before,
            after: changes.after,
            ip,
          });
        }

        return toDto(after);
      },
      // Ko'p mahsulotli brendda nomlarni qayta yig'ish uzoq davom etishi mumkin
      { timeout: 15_000 },
    );
  }

  /**
   * §4.4 — birlashtirish: manbaning mahsulotlari nishonga o'tadi,
   * manba arxivlanadi.
   *
   * **Nega `mergedIntoId` ustuni yo'q.** FK qayta yo'naltirish darhol va
   * tranzaksion: 4-qadamdan keyin bazada manbaga hech qanday havola
   * qolmaydi, ya'ni yo'naltiradigan narsa ham qolmaydi. "Aplle qayerga
   * ketdi?" degan savolga `audit_logs` javob beradi. Ustun qo'shish FK
   * allaqachon ifodalagan faktga ikkinchi, zaifroq manba yaratardi.
   */
  async merge(
    kind: TaxonomyKind,
    id: string,
    targetId: string,
    precondition: Precondition,
    actor: RequestUser,
    ip: string | null,
  ): Promise<TaxonomyMergeResultDto> {
    if (id === targetId) {
      throw AppException.rule(
        ErrorCode.CATALOG_MERGE_INVALID_TARGET,
        `${KIND_LABEL[kind]}ni o'zi bilan birlashtirib bo'lmaydi.`,
        'targetId',
        { reason: 'SELF' },
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const model = this.delegate(kind, tx);

        const [source, target] = await Promise.all([
          model.findUnique({ where: { id }, include: { _count: { select: { products: true } } } }),
          model.findUnique({
            where: { id: targetId },
            include: { _count: { select: { products: true } } },
          }),
        ]);

        if (!source) {
          throw AppException.notFound(ErrorCode.NOT_FOUND, `${KIND_LABEL[kind]} topilmadi.`);
        }
        if (!target) {
          throw AppException.notFound(
            ErrorCode.NOT_FOUND,
            `Birlashtiriladigan ${KIND_LABEL[kind].toLowerCase()} topilmadi.`,
          );
        }
        if (!target.isActive) {
          throw AppException.rule(
            ErrorCode.CATALOG_MERGE_INVALID_TARGET,
            'Arxivdagi yozuvga birlashtirib bo‘lmaydi.',
            'targetId',
            { reason: 'ARCHIVED' },
          );
        }

        /**
         * Manbani shartli `UPDATE` bilan arxivlash. Bu bir vaqtning
         * o'zida ikki vazifani bajaradi: optimistik qulf (`API.md` §8)
         * va ikkita parallel birlashtirishni ketma-ketlashtiruvchi qator
         * qulfi.
         */
        await model
          .update({
            where: { id, updatedAt: precondition.updatedAt },
            data: { isActive: false, slug: mergedSlug(source.slug, source.id) },
          })
          .catch(async (error: unknown) => {
            if (!isRecordNotFound(error)) throw error;
            const current = await model.findUnique({ where: { id } });
            throw staleResource(current?.updatedAt ?? source.updatedAt, precondition.expected);
          });

        const relation = kind === 'category' ? { categoryId: id } : { brandId: id };
        const moved = await tx.product.updateMany({
          where: relation,
          data: kind === 'category' ? { categoryId: targetId } : { brandId: targetId },
        });

        // Brend o'zgarganda nom ham o'zgaradi (§4.6); kategoriyada — yo'q
        if (kind === 'brand') {
          await this.rebuildProductNames(tx, { brandId: targetId }, target.name);
        }

        await this.audit.record(tx, actor.shopId, {
          actorId: actor.id,
          action: `${AUDIT_ENTITY[kind].toUpperCase()}_MERGED`,
          entityType: AUDIT_ENTITY[kind],
          entityId: id,
          before: { name: source.name, slug: source.slug, productCount: source._count.products },
          after: {
            targetId,
            targetName: target.name,
            movedProductCount: moved.count,
          },
          ip,
        });

        const refreshed = await model.findUniqueOrThrow({
          where: { id: targetId },
          include: { _count: { select: { products: true } } },
        });

        return { target: toDto(refreshed), movedProductCount: moved.count };
      },
      { timeout: 15_000 },
    );
  }

  /**
   * §4.6 — mahsulot nomlarini qayta yig'ish.
   *
   * Har qator o'z nomini oladi, shuning uchun bitta `updateMany` bilan
   * bo'lmaydi. SQL'da `concat_ws` bilan yozish ham rad etilgan: u
   * `buildDisplayName` ning ikkinchi nusxasi bo'lardi va bir kun undan
   * chetga chiqardi.
   */
  private async rebuildProductNames(
    tx: Prisma.TransactionClient,
    where: { brandId: string },
    brandName: string,
  ): Promise<void> {
    const products = await tx.product.findMany({
      where,
      select: { id: true, model: true, storage: true, color: true },
    });

    for (const product of products) {
      await tx.product.update({
        where: { id: product.id },
        data: {
          displayName: buildDisplayName({
            brandName,
            model: product.model,
            storage: product.storage,
            color: product.color,
          }),
        },
      });
    }
  }

  /**
   * Slug to'qnashuvini foydalanuvchi tushunadigan xatoga aylantiradi.
   *
   * `details` da mavjud yozuvning `id` si va `isActive` holati bo'ladi:
   * UI arxivdagi yozuvni tiklashni taklif qila oladi, aks holda ega
   * "bunday nom bor" degan javobni olib, uni hech qayerda topa olmasdi.
   */
  private async duplicateName(kind: TaxonomyKind, slug: string): Promise<AppException> {
    const existing = await this.delegate(kind).findUnique({ where: { slug } });

    return AppException.conflict(
      ErrorCode.CATALOG_DUPLICATE_NAME,
      existing && !existing.isActive
        ? 'Bu nom arxivdagi yozuvda bor — uni tiklang yoki boshqa nom tanlang.'
        : 'Bunday nom allaqachon mavjud.',
      existing ? { existingId: existing.id, isActive: existing.isActive } : undefined,
    );
  }

  /**
   * `Category` va `Brand` delegatlari bir xil shaklda; TypeScript ularni
   * turli tip deb biladi, shuning uchun tanlov shu yerda bir marta
   * qilinadi va qolgan kod bitta shaklga tayanadi.
   */
  private delegate(kind: TaxonomyKind, tx?: Prisma.TransactionClient): TaxonomyDelegate {
    const client = tx ?? this.prisma;
    return (kind === 'category' ? client.category : client.brand) as unknown as TaxonomyDelegate;
  }
}

// ────────────────────────── Tiplar va yordamchilar ──────────────────────────

interface TaxonomyRow {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface TaxonomyRowWithCount extends TaxonomyRow {
  _count: { products: number };
}

interface TaxonomyWhere {
  isActive?: boolean;
  name?: { contains: string; mode: 'insensitive' };
}

interface CountInclude {
  _count: { select: { products: true } };
}

/**
 * Ikkala Prisma delegatining umumiy shakli.
 *
 * Qo'lda yozilgan, chunki `Prisma.CategoryDelegate` va
 * `Prisma.BrandDelegate` strukturaviy jihatdan bir xil bo'lsa ham,
 * TypeScript ularni birlashtira olmaydi va union ustida metod
 * chaqirish ishlamaydi.
 */
interface TaxonomyDelegate {
  findMany(args: {
    where?: TaxonomyWhere;
    orderBy?: Record<string, 'asc' | 'desc'>[];
    include?: CountInclude;
    take?: number;
    skip?: number;
    cursor?: { id: string };
  }): Promise<TaxonomyRowWithCount[]>;

  findUnique(args: {
    where: { id: string } | { slug: string };
    include?: CountInclude;
  }): Promise<TaxonomyRowWithCount | null>;

  findUniqueOrThrow(args: {
    where: { id: string };
    include?: CountInclude;
  }): Promise<TaxonomyRowWithCount>;

  create(args: {
    data: { name: string; slug: string };
    include?: CountInclude;
  }): Promise<TaxonomyRowWithCount>;

  update(args: {
    where: { id: string; updatedAt?: Date | { lte: Date } };
    data: { name?: string; slug?: string; isActive?: boolean };
    include?: CountInclude;
  }): Promise<TaxonomyRowWithCount>;
}

function buildWhere(query: TaxonomyQuery): TaxonomyWhere {
  const where: TaxonomyWhere = {};

  if (query.isActive !== 'all') where.isActive = query.isActive === 'active';
  // Joker belgilar oddiy belgiga aylanadi — izoh `common/search.ts` da
  if (query.q) where.name = containsInsensitive(query.q);

  return where;
}

function parseSort(sort: TaxonomyQuery['sort']): ['name' | 'createdAt', 'asc' | 'desc'] {
  if (sort === '-createdAt') return ['createdAt', 'desc'];
  return ['name', sort === '-name' ? 'desc' : 'asc'];
}

function toDto(row: TaxonomyRowWithCount): TaxonomyDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    isActive: row.isActive,
    productCount: row._count.products,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
