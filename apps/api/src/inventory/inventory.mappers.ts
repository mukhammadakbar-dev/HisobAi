import type { InventoryBatchDto, InventoryItemDto, StockMovementDto } from '@hisobai/contracts';
import type { Prisma } from '@prisma/client';

/**
 * Ombor qatorlarini DTO'ga aylantirish.
 *
 * Alohida faylda, chunki o'qish servisi ham, qabul qilish servisi ham
 * bir xil shaklni qaytarishi kerak: `POST /inventory/receive` javobidagi
 * birlik `GET /inventory` dagi birlikdan farq qilsa, frontend ikkita
 * shaklni ushlab yurishga majbur bo'lardi.
 */

/** Ro'yxatlarda mahsulot to'liq emas, qisqa shaklda ko'rsatiladi. */
export const PRODUCT_SUMMARY = {
  select: { id: true, displayName: true, type: true, currency: true },
} as const;

export const ITEM_INCLUDE = { product: PRODUCT_SUMMARY } as const;
export const BATCH_INCLUDE = { product: PRODUCT_SUMMARY } as const;
export const MOVEMENT_INCLUDE = {
  product: { select: { displayName: true } },
} as const;

export type ItemRow = Prisma.InventoryItemGetPayload<{ include: typeof ITEM_INCLUDE }>;
export type BatchRow = Prisma.InventoryBatchGetPayload<{ include: typeof BATCH_INCLUDE }>;
export type MovementRow = Prisma.StockMovementGetPayload<{ include: typeof MOVEMENT_INCLUDE }>;

export function toItemDto(row: ItemRow): InventoryItemDto {
  return {
    id: row.id,
    productId: row.productId,
    product: {
      id: row.product.id,
      displayName: row.product.displayName,
      type: row.product.type,
      currency: row.product.currency,
    },
    imei1: row.imei1,
    imei2: row.imei2,
    serialNumber: row.serialNumber,
    // Decimal → satr (`API.md` §2.1). `PERMISSIONS.md` P7 — bu maydon
    // kelajakda rolga qarab kesib tashlanadi, shuning uchun u alohida turadi
    costPrice: row.costPrice.toString(),
    costCurrency: row.costCurrency,
    status: row.status,
    receivedAt: row.receivedAt.toISOString(),
    // §16.4 — holat `AVAILABLE` ga qaytsa ham saqlanib qoladi
    returnReason: row.returnReason,
    note: row.note,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toBatchDto(row: BatchRow): InventoryBatchDto {
  return {
    id: row.id,
    productId: row.productId,
    product: {
      id: row.product.id,
      displayName: row.product.displayName,
      type: row.product.type,
      currency: row.product.currency,
    },
    quantityReceived: row.quantityReceived,
    quantityRemaining: row.quantityRemaining,
    unitCost: row.unitCost.toString(),
    costCurrency: row.costCurrency,
    receivedAt: row.receivedAt.toISOString(),
    note: row.note,
  };
}

export function toMovementDto(row: MovementRow): StockMovementDto {
  return {
    id: row.id,
    productId: row.productId,
    productDisplayName: row.product.displayName,
    inventoryItemId: row.inventoryItemId,
    batchId: row.batchId,
    type: row.type,
    quantity: row.quantity,
    reason: row.reason,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    occurredAt: row.occurredAt.toISOString(),
    actorId: row.actorId,
    note: row.note,
  };
}
