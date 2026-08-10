import { z } from 'zod';

import { IMEI_PATTERN, MAX_RECEIVE_ROWS } from '../catalog';
import { Currency, InventoryStatus, StockMovementType } from '../enums';
import type { StockAdjustReason } from '../enums';
import type { ProductSummaryDto } from './catalog';
import {
  calendarDate,
  enumList,
  isoDateTime,
  pageQueryFields,
  positiveDecimal,
  uuidString,
} from './common';

/**
 * Ombor: qabul qilish va o'qish (§5).
 *
 * Bu fayldagi `refine` lar bazadagi cheklovlarni **ataylab takrorlaydi**.
 * Sabab: `CHECK` va trigger xatolari qaysi qator haqida ekanini
 * bilmaydi, sxema esa aniq maydonga bog'langan o'zbekcha xato beradi.
 * Baza oxirgi himoya bo'lib qoladi, sxema esa birinchi.
 */

const imei = z.string().trim().regex(IMEI_PATTERN, {
  message: "IMEI 15 ta raqamdan iborat bo'lishi kerak",
});

const serialNumber = z
  .string()
  .trim()
  .min(3, 'Seriya raqami juda qisqa')
  .max(40, 'Seriya raqami juda uzun');

// ──────────────────────── Qabul qilish (§5.11) ────────────────────────

export const receiveItemSchema = z
  .object({
    imei1: imei.nullable().optional(),
    imei2: imei.nullable().optional(),
    serialNumber: serialNumber.nullable().optional(),
    /** §4.1 — haqiqiy tannarx aynan shu birlikda saqlanadi. */
    costPrice: positiveDecimal,
    note: z.string().trim().max(200).nullable().optional(),
  })
  .strict()
  // `inventory_items_has_identifier` CHECK ning juftligi
  .refine((row) => Boolean(row.imei1) || Boolean(row.serialNumber), {
    message: 'IMEI yoki seriya raqamini kiriting',
    path: ['imei1'],
  })
  // `inventory_items_imei_distinct` CHECK ning juftligi
  .refine((row) => !row.imei2 || row.imei2 !== row.imei1, {
    message: "IMEI-2 IMEI-1 bilan bir xil bo'lmasligi kerak",
    path: ['imei2'],
  });
export type ReceiveItemInput = z.infer<typeof receiveItemSchema>;

export const receiveBatchSchema = z
  .object({
    quantityReceived: z
      .number()
      .int()
      .min(1, "Miqdor kamida 1 bo'lsin")
      .max(100_000, 'Miqdor juda katta'),
    unitCost: positiveDecimal,
    note: z.string().trim().max(200).nullable().optional(),
  })
  .strict();
export type ReceiveBatchInput = z.infer<typeof receiveBatchSchema>;

/** Bitta qatordagi identifikatorlar — krossrov tekshiruvi uchun. */
const IDENTIFIER_FIELDS = ['imei1', 'imei2', 'serialNumber'] as const;

export const receiveSchema = z
  .object({
    productId: uuidString,
    /**
     * §16.9 — mahsulot valyutasiga teng bo'lishi shart. Client ko'rgan
     * valyutani yuboradi: forma ochilgandan keyin mahsulot tahrirlangan
     * bo'lsa, server tushunarli xato beradi (trigger xatosi o'rniga).
     */
    costCurrency: z.enum(Currency),
    receivedAt: isoDateTime.optional(),
    note: z.string().trim().max(500).nullable().optional(),
    items: z.array(receiveItemSchema).min(1).max(MAX_RECEIVE_ROWS).optional(),
    batch: receiveBatchSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasItems = value.items !== undefined;
    const hasBatch = value.batch !== undefined;

    if (hasItems === hasBatch) {
      ctx.addIssue({
        code: 'custom',
        message: hasItems
          ? 'Seriyali birliklar va partiya birga yuborilmaydi'
          : "Seriyali birliklar yoki partiya ko'rsatilishi kerak",
        path: ['items'],
      });
      return;
    }

    if (value.receivedAt !== undefined) {
      // Kelajakdagi sana hisobotni buzadi; kichik zaxira soat farqi uchun
      const CLOCK_SKEW_MS = 5 * 60 * 1000;
      if (new Date(value.receivedAt).getTime() > Date.now() + CLOCK_SKEW_MS) {
        ctx.addIssue({
          code: 'custom',
          message: "Qabul sanasi kelajakda bo'lmaydi",
          path: ['receivedAt'],
        });
      }
    }

    if (!value.items) return;

    /**
     * **Payload ichidagi takroriy identifikator.**
     *
     * Bazadagi `inventory_items_identifier_guard` bitta `INSERT` ichidagi
     * qatorlarni ham ko'radi (2026-08-10 da lokal bazada tekshirilgan),
     * ya'ni bu yagona to'siq emas. Lekin trigger xatosi **qaysi qator**
     * ekanini ayta olmaydi — 50 IMEI'li formada bu foydalanuvchini
     * ko'r qilib qo'yardi. Shu sabab tekshiruv shu yerda ham bor.
     */
    const seen = new Map<string, number>();
    value.items.forEach((row, index) => {
      for (const field of IDENTIFIER_FIELDS) {
        const identifier = row[field];
        if (!identifier) continue;

        const firstIndex = seen.get(identifier);
        if (firstIndex !== undefined) {
          ctx.addIssue({
            code: 'custom',
            message: `Bu identifikator ${String(firstIndex + 1)}-qatorda ham kiritilgan`,
            path: ['items', index, field],
          });
          continue;
        }
        seen.set(identifier, index);
      }
    });
  });
export type ReceiveInput = z.infer<typeof receiveSchema>;

// ──────────────────────────── Ro'yxatlar ────────────────────────────

export const inventoryQuerySchema = z
  .object({
    productId: uuidString.optional(),
    status: enumList(InventoryStatus, 'Kamida bitta holat tanlang').optional(),
    /** IMEI-1, IMEI-2, seriya raqami yoki mahsulot nomi bo'yicha. */
    q: z.string().trim().min(1).max(120).optional(),
    sort: z.enum(['receivedAt', '-receivedAt']).default('-receivedAt'),
    ...pageQueryFields,
  })
  .strict();
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;

export const batchQuerySchema = z
  .object({
    productId: uuidString.optional(),
    sort: z.enum(['receivedAt', '-receivedAt']).default('-receivedAt'),
    ...pageQueryFields,
  })
  .strict();
export type BatchQuery = z.infer<typeof batchQuerySchema>;

export const movementQuerySchema = z
  .object({
    productId: uuidString.optional(),
    inventoryItemId: uuidString.optional(),
    type: enumList(StockMovementType, 'Kamida bitta turni tanlang').optional(),
    /** Ikkala chekka ham kiritiladi, `Asia/Tashkent` bo'yicha (`API.md` §5.2). */
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    referenceType: z.string().trim().max(30).optional(),
    referenceId: uuidString.optional(),
    sort: z.enum(['occurredAt', '-occurredAt']).default('-occurredAt'),
    ...pageQueryFields,
  })
  .strict();
export type MovementQuery = z.infer<typeof movementQuerySchema>;

// ────────────────────────────── DTO'lar ──────────────────────────────

export interface InventoryItemDto {
  id: string;
  productId: string;
  product: ProductSummaryDto;
  imei1: string | null;
  imei2: string | null;
  serialNumber: string | null;
  /** `PERMISSIONS.md` P7 — alohida barg maydon, rolga qarab kesib tashlanadi. */
  costPrice: string;
  costCurrency: Currency;
  status: InventoryStatus;
  receivedAt: string;
  /** §16.4 — holat `AVAILABLE` ga qaytsa ham bu tozalanmaydi. */
  returnReason: string | null;
  note: string | null;
  updatedAt: string;
}

export interface InventoryBatchDto {
  id: string;
  productId: string;
  product: ProductSummaryDto;
  quantityReceived: number;
  quantityRemaining: number;
  unitCost: string;
  costCurrency: Currency;
  receivedAt: string;
  note: string | null;
}

export interface StockMovementDto {
  id: string;
  productId: string;
  productDisplayName: string;
  inventoryItemId: string | null;
  batchId: string | null;
  type: StockMovementType;
  quantity: number;
  reason: StockAdjustReason | null;
  /** Bitta qabulning barcha harakatlari bitta `referenceId` bilan bog'lanadi. */
  referenceType: string | null;
  referenceId: string | null;
  occurredAt: string;
  actorId: string | null;
  note: string | null;
}

/**
 * Dublikat identifikator haqida qator darajasidagi ma'lumot
 * (`API.md` §3.3).
 *
 * `index` — **so'rovdagi** qator tartibi, bazadagi emas: forma xatoni
 * aynan o'sha inputga bog'lay olishi kerak. `existingStatus` esa
 * "nega band" degan savolga javob beradi — sotilgan telefonning IMEI'si
 * ham band bo'lib qolaveradi (§5.3).
 */
export interface DuplicateIdentifierRow {
  index: number;
  field: 'imei1' | 'imei2' | 'serialNumber';
  value: string;
  existingItemId: string;
  existingStatus: InventoryStatus;
}

export interface ReceiveResultDto {
  /** Bitta qabulni bildiruvchi identifikator; harakatlarda `referenceId`. */
  receiptId: string;
  productId: string;
  items: InventoryItemDto[];
  batch: InventoryBatchDto | null;
  totalQuantity: number;
  totalCost: string;
  currency: Currency;
}

/** `GET /inventory/:id` — birlik va uning butun tarixi (§5.10). */
export interface InventoryItemDetailDto extends InventoryItemDto {
  movements: StockMovementDto[];
}
