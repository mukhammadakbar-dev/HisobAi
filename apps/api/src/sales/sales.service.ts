import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ErrorCode,
  SaleStatus,
  UserRole,
  convertMoney,
  multiplyMoney,
  roundMoney,
  sumMoney,
  type CreateSaleDraftInput,
  type Currency,
  type Page,
  type SaleDto,
  type SaleItemInput,
  type SaleQuery,
  type SaleSummaryDto,
  type UpdateSaleDraftInput,
} from '@hisobai/contracts';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { businessDay, dayRangeFilter } from '../common/dates';
import { staleResource, type Precondition } from '../common/optimistic-lock';
import { normalizeLimit, toPage, toPrismaCursor } from '../common/pagination';
import { isRecordNotFound } from '../common/prisma-errors';
import type { RequestUser } from '../common/request-user';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { SALE_INCLUDE, SALE_SUMMARY_INCLUDE, toSaleDto, toSummaryDto } from './sales.mappers';

/** §7.5 — savdo sanasini shuncha kungacha orqaga qo'yish mumkin. */
export const MAX_BACKDATE_DAYS = 7;

/**
 * Savdo qoralamasi va o'qish (§7).
 *
 * Qoralama **hech narsaga ta'sir qilmaydi** (§7.7): ombor band
 * qilinmaydi, kassa o'zgarmaydi, savdo raqami ajratilmaydi (§17.1).
 * Shuning uchun savat butunlay almashtiriladi — eski qatorlar
 * o'chirilib, yangilari yoziladi.
 *
 * Tasdiqlash bu servisda **emas**: u alohida tranzaksiya va alohida
 * fayl (`SaleConfirmationService`). Ikkalasini bir sinfga qo'yish
 * "qoralamani yangilash" bilan "ombordan mahsulot yechish" ni bir xil
 * darajaga tushirardi — ular esa qaytarib bo'lish jihatidan butunlay
 * boshqa amallar.
 */
@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: ExchangeRatesService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get timeZone(): string {
    return this.config.get('TIMEZONE', { infer: true });
  }

  async list(query: SaleQuery): Promise<Page<SaleSummaryDto>> {
    const limit = normalizeLimit(query.limit);
    const soldAt = dayRangeFilter(query.from, query.to, this.timeZone);
    const direction = query.sort === 'soldAt' ? 'asc' : 'desc';

    const where: Prisma.SaleWhereInput = {
      status: query.status ? { in: query.status } : undefined,
      customerId: query.customerId,
      ...(soldAt ? { soldAt } : {}),
    };

    const [rows, totalCount] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: SALE_SUMMARY_INCLUDE,
        orderBy: [{ soldAt: direction }, { id: direction }],
        ...toPrismaCursor(query.cursor, limit),
      }),
      this.prisma.sale.count({ where }),
    ]);

    return toPage(rows.map(toSummaryDto), limit, (dto) => dto.soldAt, totalCount);
  }

  async requireById(id: string, actor: RequestUser): Promise<SaleDto> {
    const row = await this.prisma.sale.findUnique({ where: { id }, include: SALE_INCLUDE });
    if (!row) throw saleNotFound();
    return this.present(row, actor);
  }

  // ──────────────────────────── Qoralama ────────────────────────────

  async createDraft(
    input: CreateSaleDraftInput,
    actor: RequestUser,
    ip: string | null,
  ): Promise<SaleDto> {
    const soldAt = this.resolveSoldAt(input.soldAt);
    // §16.1 — qoralamadagi kurs faqat o'rinbosar: tasdiqlashda savdo
    // sanasidagi kurs bilan qayta yoziladi (§17.11). Ustun `NOT NULL`
    // va `CHECK (exchange_rate > 0)`, shuning uchun bo'sh qoldirib
    // bo'lmaydi — DTO esa tasdiqlanmaguncha `null` ko'rsatadi
    const rate = await this.rates.requireForDate(businessDay(soldAt, this.timeZone));

    return this.prisma.$transaction(async (tx) => {
      const items = await this.prepareItems(tx, input.items, input.currency);

      const sale = await tx.sale.create({
        data: {
          customerId: input.customerId ?? null,
          kind: input.kind,
          status: SaleStatus.DRAFT,
          currency: input.currency,
          exchangeRate: rate.storeRate,
          total: new Prisma.Decimal(items.total),
          soldAt,
          createdById: actor.id,
          items: { create: items.rows },
        },
        include: SALE_INCLUDE,
      });

      await this.audit.record(tx, actor.shopId, {
        actorId: actor.id,
        action: 'SALE_DRAFT_CREATED',
        entityType: 'Sale',
        entityId: sale.id,
        after: { currency: sale.currency, total: sale.total, itemCount: sale.items.length },
        ip,
      });

      return this.present(sale, actor);
    });
  }

  async updateDraft(
    id: string,
    input: UpdateSaleDraftInput,
    precondition: Precondition,
    actor: RequestUser,
    ip: string | null,
  ): Promise<SaleDto> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.sale.findUnique({ where: { id }, include: SALE_INCLUDE });
      if (!before) throw saleNotFound();
      assertDraft(before.status);

      const currency = input.currency ?? before.currency;
      const soldAt = input.soldAt ? this.resolveSoldAt(input.soldAt) : before.soldAt;

      const data: Prisma.SaleUpdateInput = { soldAt };
      if (input.customerId !== undefined) {
        data.customer = input.customerId
          ? { connect: { id: input.customerId } }
          : { disconnect: true };
      }
      if (input.currency !== undefined) data.currency = currency;

      if (input.items !== undefined) {
        const items = await this.prepareItems(tx, input.items, currency);
        // Savat to'liq almashtiriladi: qisman yangilash ketma-ketligi
        // yo'qolgan so'rov tufayli yarim savat qoldirardi
        await tx.saleItem.deleteMany({ where: { saleId: id } });
        data.items = { create: items.rows };
        data.total = new Prisma.Decimal(items.total);
      } else if (input.currency !== undefined) {
        // Valyuta o'zgarsa jami yaxlitlash qoidasi ham o'zgaradi
        const items = await this.prepareItems(tx, before.items.map(toItemInput), currency);
        await tx.saleItem.deleteMany({ where: { saleId: id } });
        data.items = { create: items.rows };
        data.total = new Prisma.Decimal(items.total);
      }

      const after = await tx.sale
        .update({
          where: { id, updatedAt: precondition.updatedAt },
          data,
          include: SALE_INCLUDE,
        })
        .catch(async (error: unknown) => {
          if (!isRecordNotFound(error)) throw error;
          const current = await tx.sale.findUnique({ where: { id } });
          throw staleResource(current?.updatedAt ?? before.updatedAt, precondition.expected);
        });

      await this.audit.record(tx, actor.shopId, {
        actorId: actor.id,
        action: 'SALE_DRAFT_UPDATED',
        entityType: 'Sale',
        entityId: id,
        before: { total: before.total, itemCount: before.items.length },
        after: { total: after.total, itemCount: after.items.length },
        ip,
      });

      return this.present(after, actor);
    });
  }

  /** §7.7 — qoralama o'chiriladi va hech qanday iz qoldirmaydi (§17.1). */
  async removeDraft(id: string, actor: RequestUser, ip: string | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id } });
      if (!sale) throw saleNotFound();
      assertDraft(sale.status);

      await tx.sale.delete({ where: { id } });

      await this.audit.record(tx, actor.shopId, {
        actorId: actor.id,
        action: 'SALE_DRAFT_DELETED',
        entityType: 'Sale',
        entityId: id,
        before: { currency: sale.currency, total: sale.total, soldAt: sale.soldAt.toISOString() },
        ip,
      });
    });
  }

  // ──────────────────────────── Umumiy qismlar ────────────────────────────

  /**
   * Savat qatorlarini tayyorlaydi: mahsulot bor-yo'qligi, tur mosligi,
   * tannarx va tavsiya narx snapshotlari.
   *
   * Qoralamada snapshotlar **oldindan** yoziladi (ustunlar `NOT NULL`),
   * lekin ular hali yakuniy emas: tasdiqlash tranzaksiyasi ularni
   * o'sha paytdagi haqiqiy qiymat bilan qayta yozadi (§7.11). Ikki
   * marta yozilishi ataylab — qoralama ochiq turganda mahsulot narxi
   * o'zgarishi mumkin va foyda o'sha eski qiymat bilan hisoblanib
   * qolmasligi kerak.
   */
  private async prepareItems(
    tx: Prisma.TransactionClient,
    rows: SaleItemInput[],
    currency: Currency,
  ): Promise<{ rows: Prisma.SaleItemCreateWithoutSaleInput[]; total: string }> {
    if (rows.length === 0) return { rows: [], total: roundMoney('0', currency) };

    const products = await tx.product.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.productId))] } },
      select: {
        id: true,
        currency: true,
        isActive: true,
        suggestedPrice: true,
        lastCostPrice: true,
      },
    });
    const byId = new Map(products.map((product) => [product.id, product]));

    const prepared: Prisma.SaleItemCreateWithoutSaleInput[] = [];
    const lineTotals: string[] = [];

    for (const [index, row] of rows.entries()) {
      const product = byId.get(row.productId);
      if (!product) {
        throw AppException.rule(
          ErrorCode.NOT_FOUND,
          'Mahsulot topilmadi.',
          `items.${String(index)}.productId`,
        );
      }
      if (!product.isActive) {
        throw AppException.rule(
          ErrorCode.CATALOG_PRODUCT_ARCHIVED,
          'Bu mahsulot arxivda — savdoga qo‘shib bo‘lmaydi.',
          `items.${String(index)}.productId`,
        );
      }

      const cost = await this.readCost(tx, row, product, index);
      const unitPrice = roundMoney(row.unitPrice, currency);

      prepared.push({
        product: { connect: { id: row.productId } },
        ...(row.inventoryItemId ? { inventoryItem: { connect: { id: row.inventoryItemId } } } : {}),
        ...(row.batchId ? { batch: { connect: { id: row.batchId } } } : {}),
        quantity: row.quantity,
        unitPrice: new Prisma.Decimal(unitPrice),
        costSnapshot: new Prisma.Decimal(cost.amount),
        costCurrency: cost.currency,
        // §7.4 — chegirma hisoboti uchun: tavsiya narx keyin o'zgarsa,
        // bugungi chegirma o'zgarmasligi kerak
        suggestedPriceSnapshot: product.suggestedPrice,
      });
      lineTotals.push(multiplyMoney(unitPrice, row.quantity, currency));
    }

    return { rows: prepared, total: sumMoney(lineTotals, currency) };
  }

  /**
   * Tannarx snapshot manbai (§7.11).
   *
   * Tartib muhim: **aynan shu birlik** → **aynan shu partiya** →
   * mahsulotning oxirgi tannarxi. Seriyali telefonda har birlikning o'z
   * tannarxi bor (§4.1) va o'rtacha qiymat foydani yolg'on ko'rsatardi.
   */
  private async readCost(
    tx: Prisma.TransactionClient,
    row: SaleItemInput,
    product: { id: string; currency: Currency; lastCostPrice: Prisma.Decimal | null },
    index: number,
  ): Promise<{ amount: string; currency: Currency }> {
    if (row.inventoryItemId) {
      const item = await tx.inventoryItem.findUnique({
        where: { id: row.inventoryItemId },
        select: { productId: true, costPrice: true, costCurrency: true },
      });
      if (!item || item.productId !== product.id) {
        throw AppException.rule(
          ErrorCode.NOT_FOUND,
          'Ombor birligi topilmadi.',
          `items.${String(index)}.inventoryItemId`,
        );
      }
      return { amount: item.costPrice.toString(), currency: item.costCurrency };
    }

    if (row.batchId) {
      const batch = await tx.inventoryBatch.findUnique({
        where: { id: row.batchId },
        select: { productId: true, unitCost: true, costCurrency: true },
      });
      if (!batch || batch.productId !== product.id) {
        throw AppException.rule(
          ErrorCode.NOT_FOUND,
          'Partiya topilmadi.',
          `items.${String(index)}.batchId`,
        );
      }
      return { amount: batch.unitCost.toString(), currency: batch.costCurrency };
    }

    // Ombor birligi ko'rsatilmagan qator — faqat qoralamada bo'ladi;
    // tasdiqlashda `SaleConfirmationService` uni rad etadi
    return { amount: product.lastCostPrice?.toString() ?? '0', currency: product.currency };
  }

  /**
   * §7.5 — sana 7 kundan ortiq orqada yoki kelajakda bo'lmasligi kerak.
   *
   * Kelajak ham to'siladi: ertangi sana bilan yozilgan savdo bugungi
   * hisobotdan tushib qolardi va ega uni yo'qolgan deb o'ylardi.
   */
  private resolveSoldAt(raw: string | undefined): Date {
    if (!raw) return new Date();

    const soldAt = new Date(raw);
    const now = Date.now();
    if (soldAt.getTime() > now) {
      throw AppException.rule(
        ErrorCode.SALE_DATE_OUT_OF_RANGE,
        "Savdo sanasi kelajakda bo'lmaydi.",
        'soldAt',
      );
    }
    if (now - soldAt.getTime() > MAX_BACKDATE_DAYS * 86_400_000) {
      throw AppException.rule(
        ErrorCode.SALE_DATE_OUT_OF_RANGE,
        `Savdo sanasini ${String(MAX_BACKDATE_DAYS)} kundan ortiq orqaga qo'yib bo'lmaydi.`,
        'soldAt',
      );
    }
    return soldAt;
  }

  /**
   * DTO'ga aylantirish + rolga qarab kesish.
   *
   * `PERMISSIONS.md` P7 — `SELLER` tannarxni ko'rmaydi, demak foydani
   * ham: sotuv narxi bilan foydadan tannarxni qaytarib hisoblash oson
   * bo'lardi.
   */
  private present(row: Parameters<typeof toSaleDto>[0], actor: RequestUser): SaleDto {
    const showCost = actor.role === UserRole.SHOP_ADMIN;
    return toSaleDto(row, { showCost, profit: showCost ? profitOf(row) : null });
  }
}

/**
 * Savat foydasi (§7.9) — sotuv summasi minus tannarx.
 *
 * Tannarx boshqa valyutada bo'lsa, savdo kursida aylantiriladi (§1.9):
 * mahsulot USD'da yuritilib, savdo so'mda bo'lishi odatiy holat.
 */
export function profitOf(row: {
  currency: Currency;
  exchangeRate: Prisma.Decimal;
  items: {
    quantity: number;
    unitPrice: Prisma.Decimal;
    costSnapshot: Prisma.Decimal;
    costCurrency: Currency;
  }[];
}): string {
  const parts: string[] = [];

  for (const item of row.items) {
    const revenue = multiplyMoney(item.unitPrice.toString(), item.quantity, row.currency);
    const cost = convert(item.costSnapshot, item.costCurrency, row.currency, row.exchangeRate);
    parts.push(revenue, `-${multiplyMoney(cost, item.quantity, row.currency)}`);
  }

  return sumMoney(parts, row.currency);
}

/**
 * USD ↔ UZS — savdo kursi bo'yicha (§1.7 snapshot).
 *
 * Hisobning o'zi `contracts` da (`convertMoney`): aynan shu qoida savdo
 * formasida "qancha qoldi" ni ko'rsatishda ham kerak va ikki joyda ikki
 * xil yozilsa, ekrandagi qoldiq bilan serverning §17.10 tekshiruvi
 * bir-biriga zid javob berardi (`FRONTEND.md` §6.1). Bu yerda faqat
 * `Decimal` → satr o'tkazish qoladi.
 */
export function convert(
  amount: Prisma.Decimal,
  from: Currency,
  to: Currency,
  rate: Prisma.Decimal,
): string {
  return convertMoney(amount.toString(), from, to, rate.toString());
}

function toItemInput(item: {
  productId: string;
  inventoryItemId: string | null;
  batchId: string | null;
  quantity: number;
  unitPrice: Prisma.Decimal;
}): SaleItemInput {
  return {
    productId: item.productId,
    inventoryItemId: item.inventoryItemId,
    batchId: item.batchId,
    quantity: item.quantity,
    unitPrice: item.unitPrice.toString(),
  };
}

export function assertDraft(status: SaleStatus): void {
  if (status === SaleStatus.DRAFT) return;
  throw AppException.rule(
    status === SaleStatus.CONFIRMED ? ErrorCode.SALE_ALREADY_CONFIRMED : ErrorCode.SALE_NOT_DRAFT,
    'Tasdiqlangan savdo o‘zgartirilmaydi. Qaytarish yoki bekor qilish orqali tuzating.',
  );
}

export function saleNotFound(): AppException {
  return AppException.notFound(ErrorCode.NOT_FOUND, 'Savdo topilmadi.');
}
