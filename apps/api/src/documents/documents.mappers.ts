import type { Document } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { DocumentGenerateDto, DocumentVersionDto } from '@hisobai/contracts';

import type { ContractPdfData } from './pdf/contract-pdf.builder';

/**
 * PDF generatsiyasi uchun kerakli hamma narsa bitta so'rovda (§16.10):
 * mijoz, mahsulotlar (IMEI bilan) va to'lov jadvali.
 */
export const CONTRACT_PDF_INCLUDE = {
  sale: {
    include: {
      customer: true,
      items: {
        include: {
          product: { select: { displayName: true } },
          inventoryItem: { select: { imei1: true, imei2: true, serialNumber: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  },
  schedules: { orderBy: { sequence: 'asc' } },
} satisfies Prisma.InstallmentContractInclude;

export type ContractPdfRow = Prisma.InstallmentContractGetPayload<{
  include: typeof CONTRACT_PDF_INCLUDE;
}>;

/**
 * Prisma qatorini PDF quruvchisi kutgan shaklga o'tkazadi.
 *
 * **Bu yerda ham hech qanday pul hisobi yo'q** — faqat `Decimal.toString()`
 * (§17.14 formatlash HISOB emas qoidasi bilan bir mantiq: bu funksiya
 * shaklni o'zgartiradi, qiymatni emas).
 */
export function toPdfData(
  shop: { name: string; address: string | null; phone: string | null },
  contract: ContractPdfRow,
  contractDate: string,
): ContractPdfData {
  const customer = contract.sale.customer;

  return {
    shop,
    saleNumber: contract.sale.number,
    contractDate,
    currency: contract.currency,
    customer: {
      // §17.18 — nasiya savdoda mijoz majburiy (`SALE_CUSTOMER_REQUIRED`),
      // ya'ni bu yerda `null` amalda bo'lmaydi; bo'lsa ham PDF cho'kmasin.
      fullName: customer?.fullName ?? '—',
      phone: customer?.phonePrimary ?? '—',
      address: customer?.address ?? null,
      passport: formatPassport(customer?.passportSeries, customer?.passportNumber),
      pinfl: customer?.pinfl ?? null,
    },
    items: contract.sale.items.map((item) => ({
      name: item.product.displayName,
      identifier: formatIdentifier(item.inventoryItem),
      quantity: item.quantity,
      unitPrice: item.unitPrice.toString(),
    })),
    cashPrice: contract.cashPrice.toString(),
    markupAmount: contract.markupAmount.toString(),
    markupPercent: contract.markupPercent?.toString() ?? null,
    downPayment: contract.downPayment.toString(),
    principal: contract.principal.toString(),
    schedules: contract.schedules.map((schedule) => ({
      sequence: schedule.sequence,
      dueDate: schedule.dueDate.toISOString().slice(0, 10),
      amountDue: schedule.amountDue.toString(),
    })),
  };
}

function formatPassport(series?: string | null, number?: string | null): string | null {
  if (!series && !number) return null;
  return [series, number].filter(Boolean).join(' ');
}

function formatIdentifier(
  item: { imei1: string | null; imei2: string | null; serialNumber: string | null } | null,
): string | null {
  if (!item) return null;
  if (item.serialNumber) return item.serialNumber;
  return [item.imei1, item.imei2].filter(Boolean).join(' / ') || null;
}

export function toGenerateDto(doc: Document): DocumentGenerateDto {
  return {
    documentId: doc.id,
    version: doc.version,
    fileId: doc.fileId,
    // §15.2 — generatsiyada doim to'ldiriladi; `null` bu yo'lda amalda
    // bo'lmaydi (ustun eski/qo'lda yozuv uchun nullable qolgan).
    contentHash: doc.contentHash ?? '',
    createdAt: doc.createdAt.toISOString(),
  };
}

export function toVersionDto(doc: Document): DocumentVersionDto {
  return {
    id: doc.id,
    version: doc.version,
    fileId: doc.fileId,
    contentHash: doc.contentHash,
    createdAt: doc.createdAt.toISOString(),
  };
}
