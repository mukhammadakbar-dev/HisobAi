import type { SaleDto, SaleItemDto, SalePaymentDto, SaleSummaryDto } from '@hisobai/contracts';
import type { Prisma } from '@prisma/client';

/**
 * Savdo qatorlarini DTO'ga aylantirish.
 *
 * `costSnapshot` va `profit` **ataylab `null` bo'la oladi**:
 * `PERMISSIONS.md` P7 — `SELLER` tannarxni va foydani ko'rmaydi.
 * Maydonni javobdan butunlay olib tashlash o'rniga `null` qaytariladi,
 * shunda frontend "ruxsat yo'q" bilan "hali hisoblanmagan" ni ajrata
 * oladi.
 */

export const SALE_INCLUDE = {
  customer: { select: { id: true, fullName: true } },
  items: {
    include: { product: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: 'asc' },
  },
  payments: {
    include: { cashAccount: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.SaleInclude;

export const SALE_SUMMARY_INCLUDE = {
  customer: { select: { id: true, fullName: true } },
  _count: { select: { items: true } },
} satisfies Prisma.SaleInclude;

export type SaleRow = Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;
export type SaleSummaryRow = Prisma.SaleGetPayload<{ include: typeof SALE_SUMMARY_INCLUDE }>;

export function toSummaryDto(row: SaleSummaryRow): SaleSummaryDto {
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    status: row.status,
    currency: row.currency,
    total: row.total.toString(),
    soldAt: row.soldAt.toISOString(),
    customerId: row.customerId,
    customerName: row.customer?.fullName ?? null,
    itemCount: row._count.items,
  };
}

export function toSaleDto(
  row: SaleRow,
  options: { showCost: boolean; profit: string | null },
): SaleDto {
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    status: row.status,
    currency: row.currency,
    total: row.total.toString(),
    soldAt: row.soldAt.toISOString(),
    customerId: row.customerId,
    customerName: row.customer?.fullName ?? null,
    itemCount: row.items.length,
    // §16.1 — kurs snapshot tasdiqlashda yoziladi. Qoralamada ustun
    // `0` bo'lib turadi (NOT NULL), lekin DTO'da `null`: "hali
    // aniqlanmagan" ni nol kurs deb ko'rsatish yolg'on bo'lardi
    exchangeRate: row.confirmedAt ? row.exchangeRate.toString() : null,
    note: null,
    items: row.items.map((item) => toItemDto(item, options.showCost)),
    payments: row.payments.map(toPaymentDto),
    profit: options.showCost ? options.profit : null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toItemDto(item: SaleRow['items'][number], showCost: boolean): SaleItemDto {
  return {
    id: item.id,
    productId: item.productId,
    productName: item.product.displayName,
    inventoryItemId: item.inventoryItemId,
    batchId: item.batchId,
    quantity: item.quantity,
    unitPrice: item.unitPrice.toString(),
    costSnapshot: showCost ? item.costSnapshot.toString() : null,
    costCurrency: showCost ? item.costCurrency : null,
    suggestedPriceSnapshot: item.suggestedPriceSnapshot?.toString() ?? null,
    returnedQuantity: item.returnedQuantity,
  };
}

function toPaymentDto(payment: SaleRow['payments'][number]): SalePaymentDto {
  return {
    id: payment.id,
    method: payment.method,
    status: payment.status,
    paidAmount: payment.paidAmount.toString(),
    paidCurrency: payment.paidCurrency,
    appliedAmount: payment.appliedAmount.toString(),
    appliedCurrency: payment.appliedCurrency,
    cashAccountId: payment.cashAccountId,
    cashAccountName: payment.cashAccount?.name ?? null,
    paidAt: payment.paidAt.toISOString(),
    confirmedAt: payment.confirmedAt?.toISOString() ?? null,
  };
}
