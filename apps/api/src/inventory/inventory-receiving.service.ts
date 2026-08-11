import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  ErrorCode,
  ProductType,
  multiplyMoney,
  roundMoney,
  sumMoney,
  type Currency,
  type DuplicateIdentifierRow,
  type ReceiveInput,
  type ReceiveItemInput,
  type ReceiveResultDto,
} from '@hisobai/contracts';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { isUniqueViolation } from '../common/prisma-errors';
import type { RequestUser } from '../common/request-user';
import { PrismaService } from '../database/prisma.service';
import { ITEM_INCLUDE, toBatchDto, toItemDto } from './inventory.mappers';

/**
 * Qabul qilish (§5.11) — **bitta tranzaksiya**.
 *
 * Uch narsa birga yoziladi va uchalasi ham bo'lmasa, hech biri
 * bo'lmasligi kerak: ombor yozuvi (birlik yoki partiya), `RECEIVE`
 * harakati (§5.10) va mahsulotdagi `lastCostPrice` (§4.2). Ular ayri
 * yozilsa, qoldiq bilan harakatlar tarixi bir-biriga mos kelmay
 * qolardi — buni keyin faqat qo'lda tuzatish mumkin.
 *
 * Endpoint `@Idempotent()` (§17.6): do'kondagi internet uzilganda ega
 * tugmani qayta bosadi va 50 ta IMEI ikki marta kiritilishi mumkin
 * bo'lardi. Bu yerdagi dublikat tekshiruvi uni ushlar edi, lekin
 * foydalanuvchi "hammasi dublikat" degan xatoni ko'rardi.
 */

/** Bitta qatordagi identifikatorlar — tekshiruv shu tartibda yuradi. */
const IDENTIFIER_FIELDS = ['imei1', 'imei2', 'serialNumber'] as const;
type IdentifierField = (typeof IDENTIFIER_FIELDS)[number];

/** Harakatlarda bitta qabulning barcha qatorlari shu bilan bog'lanadi. */
const RECEIPT_REFERENCE = 'RECEIVE';

@Injectable()
export class InventoryReceivingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async receive(
    input: ReceiveInput,
    actor: RequestUser,
    ip: string | null,
  ): Promise<ReceiveResultDto> {
    const receiptId = randomUUID();
    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();

    return this.prisma.$transaction(
      async (tx) => {
        const product = await tx.product.findUnique({
          where: { id: input.productId },
          select: { id: true, displayName: true, type: true, currency: true, isActive: true },
        });

        if (!product) {
          throw AppException.rule(ErrorCode.NOT_FOUND, 'Mahsulot topilmadi.', 'productId');
        }
        // §4.8 — arxivdagi shablonga qabul qilinsa, qoldiq ko'rinmaydigan
        // joyda paydo bo'lardi: u savdo formasida chiqmaydi
        if (!product.isActive) {
          throw AppException.rule(
            ErrorCode.CATALOG_PRODUCT_ARCHIVED,
            'Bu mahsulot arxivda — avval uni tiklang.',
            'productId',
          );
        }
        // §16.9 — bazadagi trigger ham to'sadi, lekin uning xatosi
        // foydalanuvchiga hech narsa aytmaydi
        if (product.currency !== input.costCurrency) {
          throw AppException.rule(
            ErrorCode.INVENTORY_COST_CURRENCY_MISMATCH,
            `Bu mahsulot ${product.currency} da yuritiladi — tannarx ham shu valyutada bo'lsin.`,
            'costCurrency',
            { productCurrency: product.currency },
          );
        }

        const context: ReceiptContext = {
          receiptId,
          receivedAt,
          note: input.note ?? null,
          actor,
          ip,
        };

        if (input.items) {
          if (product.type !== ProductType.SERIALIZED) {
            throw typeMismatch(product.type, 'items');
          }
          return this.receiveItems(tx, product, input.items, context);
        }

        // Sxema ikkalasidan aynan bittasini talab qiladi (`receiveSchema`
        // dagi `superRefine`), ya'ni bu shoxda `batch` bor
        if (!input.batch || product.type !== ProductType.QUANTITY) {
          throw typeMismatch(product.type, 'batch');
        }
        return this.receiveBatch(tx, product, input.batch, context);
      },
      // 200 qatorli qabulda trigger har identifikator uchun advisory lock
      // oladi — standart 5 soniya kam bo'lishi mumkin
      { timeout: 30_000 },
    );
  }

  // ──────────────────────── Seriyali birliklar (§5.1) ────────────────────────

  private async receiveItems(
    tx: Prisma.TransactionClient,
    product: ProductRef,
    items: ReceiveItemInput[],
    context: ReceiptContext,
  ): Promise<ReceiveResultDto> {
    await this.assertIdentifiersFree(tx, items);

    // Tannarx qator bilan birga saqlanadi: indeks bo'yicha izlansa,
    // topilmagan holat uchun zaxira kerak bo'lardi va o'sha zaxira
    // yaxlitlanmagan qiymatni bazaga o'tkazib yuborardi (§1.10)
    const prepared = items.map((row) => ({
      row,
      cost: roundMoney(row.costPrice, product.currency),
    }));

    const created = await tx.inventoryItem
      .createManyAndReturn({
        data: prepared.map(({ row, cost }) => ({
          productId: product.id,
          imei1: row.imei1 ?? null,
          imei2: row.imei2 ?? null,
          serialNumber: row.serialNumber ?? null,
          // §1.10 — yaxlitlash yozishdan OLDIN
          costPrice: new Prisma.Decimal(cost),
          costCurrency: product.currency,
          receivedAt: context.receivedAt,
          note: row.note ?? null,
        })),
        include: ITEM_INCLUDE,
      })
      .catch((error: unknown) => {
        // Oldingi tekshiruvdan keyin qo'shilgan qator — `inventory_items_identifier_guard`
        if (isUniqueViolation(error)) throw concurrentDuplicate();
        throw error;
      });

    await tx.stockMovement.createMany({
      data: created.map((item) => ({
        productId: product.id,
        inventoryItemId: item.id,
        type: 'RECEIVE' as const,
        quantity: 1,
        referenceType: RECEIPT_REFERENCE,
        referenceId: context.receiptId,
        occurredAt: context.receivedAt,
        actorId: context.actor.id,
        note: context.note,
      })),
    });

    // §4.2 — qabul formasini keyingi safar oldindan to'ldirish uchun
    const lastCost = prepared.at(-1)?.cost ?? null;
    await this.rememberLastCost(tx, product.id, lastCost);

    /**
     * Jami — `sumMoney` bilan, `Decimal.plus` bilan emas.
     *
     * Sabab **satr ko'rinishi emas**: `API.md` §2.1 ataylab ikkalasini
     * ham to'g'ri deb e'lon qiladi ("12500000" ham, "12500000.00" ham),
     * chunki ko'rsatishda `formatMoney` valyuta miqyosini o'zi qo'llaydi.
     * Sabab — **bitta hisob ikki marta yozilmasin**: qabul formasi jamini
     * `sumMoney` bilan chiqaradi, server esa boshqa kutubxona bilan
     * hisoblasa, ikkovi bir kun ajralib ketadi va qaysi biri to'g'ri
     * ekanini aniqlash mumkin bo'lmaydi (§17.14 ruhi).
     *
     * Birlikning o'z `costPrice` i esa bazadan `Decimal` bo'lib keladi va
     * global `DecimalSerializerInterceptor` orqali o'tadi — u §2.1 ga
     * ko'ra qiymatni o'zgartirmaydi.
     */
    const dto: ReceiveResultDto = {
      receiptId: context.receiptId,
      productId: product.id,
      items: created.map(toItemDto),
      batch: null,
      totalQuantity: created.length,
      totalCost: sumMoney(
        prepared.map(({ cost }) => cost),
        product.currency,
      ),
      currency: product.currency,
    };

    await this.recordAudit(tx, product, dto, context);
    return dto;
  }

  /**
   * Dublikat identifikatorlarni **qator raqami bilan** qaytaradi
   * (`API.md` §3.3).
   *
   * Bu tekshiruv trigger o'rnini bosmaydi va bosa olmaydi: `SELECT`
   * bilan `INSERT` orasiga boshqa tranzaksiya sig'adi. U faqat **xato
   * matni** uchun — trigger qaysi qator ekanini ayta olmaydi, 50 IMEI'li
   * formada esa "biri dublikat" degan xabar foydasiz. Haqiqiy kafolat
   * `inventory_items_identifier_guard` da qoladi.
   */
  private async assertIdentifiersFree(
    tx: Prisma.TransactionClient,
    items: ReceiveItemInput[],
  ): Promise<void> {
    const requested = new Map<string, { index: number; field: IdentifierField }>();
    items.forEach((row, index) => {
      for (const field of IDENTIFIER_FIELDS) {
        const value = row[field];
        if (value) requested.set(value, { index, field });
      }
    });
    if (requested.size === 0) return;

    const values = [...requested.keys()];
    const existing = await tx.inventoryItem.findMany({
      where: {
        OR: [
          { imei1: { in: values } },
          { imei2: { in: values } },
          { serialNumber: { in: values } },
        ],
      },
      select: { id: true, imei1: true, imei2: true, serialNumber: true, status: true },
    });
    if (existing.length === 0) return;

    const rows: DuplicateIdentifierRow[] = [];
    for (const item of existing) {
      for (const candidate of [item.imei1, item.imei2, item.serialNumber]) {
        const hit = candidate ? requested.get(candidate) : undefined;
        if (!candidate || !hit) continue;
        rows.push({
          index: hit.index,
          field: hit.field,
          value: candidate,
          existingItemId: item.id,
          // §5.3 — sotilgan telefonning IMEI'si ham band bo'lib qolaveradi
          existingStatus: item.status,
        });
      }
    }
    if (rows.length === 0) return;

    rows.sort((left, right) => left.index - right.index);
    throw AppException.conflict(
      ErrorCode.INVENTORY_DUPLICATE_IMEI,
      rows.length === 1
        ? 'Bu identifikator allaqachon bazada bor.'
        : `${String(rows.length)} ta identifikator allaqachon bazada bor.`,
      { rows },
    );
  }

  // ──────────────────────── Miqdorli partiya (§5.2) ────────────────────────

  private async receiveBatch(
    tx: Prisma.TransactionClient,
    product: ProductRef,
    batch: NonNullable<ReceiveInput['batch']>,
    context: ReceiptContext,
  ): Promise<ReceiveResultDto> {
    const unitCost = roundMoney(batch.unitCost, product.currency);

    const created = await tx.inventoryBatch.create({
      data: {
        productId: product.id,
        quantityReceived: batch.quantityReceived,
        // Yangi partiyada qoldiq = kelgan miqdor; keyin faqat shartli
        // `UPDATE` bilan kamayadi (§17.5)
        quantityRemaining: batch.quantityReceived,
        unitCost: new Prisma.Decimal(unitCost),
        costCurrency: product.currency,
        receivedAt: context.receivedAt,
        note: batch.note ?? null,
      },
      include: { product: { select: { id: true, displayName: true, type: true, currency: true } } },
    });

    await tx.stockMovement.create({
      data: {
        productId: product.id,
        batchId: created.id,
        type: 'RECEIVE',
        quantity: batch.quantityReceived,
        referenceType: RECEIPT_REFERENCE,
        referenceId: context.receiptId,
        occurredAt: context.receivedAt,
        actorId: context.actor.id,
        note: context.note,
      },
    });

    await this.rememberLastCost(tx, product.id, unitCost);

    const dto: ReceiveResultDto = {
      receiptId: context.receiptId,
      productId: product.id,
      items: [],
      batch: toBatchDto(created),
      totalQuantity: batch.quantityReceived,
      // Formadagi "jami" bilan bir xil funksiya — izoh `receiveItems` da
      totalCost: multiplyMoney(unitCost, batch.quantityReceived, product.currency),
      currency: product.currency,
    };

    await this.recordAudit(tx, product, dto, context);
    return dto;
  }

  // ──────────────────────────── Umumiy qismlar ────────────────────────────

  private async rememberLastCost(
    tx: Prisma.TransactionClient,
    productId: string,
    cost: string | null,
  ): Promise<void> {
    if (cost === null) return;
    await tx.product.update({
      where: { id: productId },
      data: { lastCostPrice: new Prisma.Decimal(cost) },
    });
  }

  private async recordAudit(
    tx: Prisma.TransactionClient,
    product: ProductRef,
    result: ReceiveResultDto,
    context: ReceiptContext,
  ): Promise<void> {
    await this.audit.record(tx, {
      actorId: context.actor.id,
      action: 'INVENTORY_RECEIVED',
      // Qabul alohida jadval emas — `receiptId` harakatlardagi
      // `referenceId` bilan bir xil va tarixni shu bog'laydi
      entityType: 'InventoryReceipt',
      entityId: context.receiptId,
      after: {
        productId: product.id,
        productDisplayName: product.displayName,
        totalQuantity: result.totalQuantity,
        totalCost: result.totalCost,
        currency: result.currency,
        receivedAt: context.receivedAt.toISOString(),
        itemIds: result.items.map((item) => item.id),
        batchId: result.batch?.id ?? null,
      },
      ip: context.ip,
    });
  }
}

// ────────────────────────── Tiplar va yordamchilar ──────────────────────────

interface ProductRef {
  id: string;
  displayName: string;
  type: string;
  currency: Currency;
}

interface ReceiptContext {
  receiptId: string;
  receivedAt: Date;
  note: string | null;
  actor: RequestUser;
  ip: string | null;
}

/**
 * Sxema mahsulot turini bilmaydi — u faqat "items yoki batch" ekanini
 * tekshiradi. Turga mosligini shu yerda tekshiramiz.
 */
function typeMismatch(productType: string, field: 'items' | 'batch'): AppException {
  return AppException.rule(
    ErrorCode.INVENTORY_PRODUCT_TYPE_MISMATCH,
    productType === ProductType.SERIALIZED
      ? 'Bu seriyali mahsulot — har birlik uchun IMEI yoki seriya raqamini kiriting.'
      : 'Bu miqdorli mahsulot — miqdor va donasiga tannarxni kiriting.',
    field,
    { productType },
  );
}

function concurrentDuplicate(): AppException {
  return AppException.conflict(
    ErrorCode.INVENTORY_DUPLICATE_IMEI,
    "Identifikatorlardan biri hozirgina boshqa qabulda kiritildi. Ro'yxatni tekshirib, qaytadan urinib ko'ring.",
  );
}
