import { z } from 'zod';

import { Currency, PaymentMethod, ReversalReason, SaleKind, SaleStatus } from '../enums';
import type { PaymentStatus, ReversalKind } from '../enums';
import {
  calendarDate,
  enumList,
  expectedUpdatedAt,
  isoDateTime,
  pageQueryFields,
  positiveDecimal,
  uuidString,
} from './common';

/**
 * Savdo (§7).
 *
 * Oqim ikki bosqichli va sxemalar shuni aks ettiradi:
 *
 *  - **qoralama** (`DRAFT`) — istalgancha o'zgaradi, hech narsaga ta'sir
 *    qilmaydi. Shuning uchun qatorsiz qoralama ham to'g'ri: savatni
 *    to'ldirishdan oldin saqlab qo'yish mumkin (§7.7);
 *  - **tasdiqlash** — ombor, kassa va to'lovlarni bitta tranzaksiyada
 *    o'zgartiradi, shuning uchun `confirmSaleSchema` da to'lovlar
 *    **majburiy** va bo'sh savat serverda `SALE_EMPTY` bilan rad
 *    etiladi (§17.10).
 *
 * **Chegirma maydoni yo'q** (§7.3): narx `unitPrice` da to'g'ridan-to'g'ri
 * o'zgartiriladi, chegirma esa hisobotda `tavsiya narx − haqiqiy narx`
 * sifatida chiqadi (§7.4).
 *
 * 5-bosqichda faqat **naqd savdo**: `kind` uchun `CASH` dan boshqa qiymat
 * qabul qilinmaydi. Nasiya (`INSTALLMENT`) 7-bosqichda shartnoma va
 * to'lov jadvali bilan birga keladi — usiz `INSTALLMENT` savdo qarzni
 * hech qayerda qoldirmasdan "yo'qolgan" bo'lardi.
 */

const note = z.string().trim().max(300, 'Izoh 300 belgidan oshmasin').nullable().optional();

/**
 * Savat qatori.
 *
 * `inventoryItemId` va `batchId` dan qaysi biri kerakligini **mahsulot
 * turi** hal qiladi (seriyali yoki miqdorli), buni server tekshiradi:
 * sxema mahsulotni ko'rmaydi. Bu yerda faqat ikkalasi birdan
 * yuborilmasligi ta'minlanadi.
 */
export const saleItemInputSchema = z
  .object({
    productId: uuidString,
    inventoryItemId: uuidString.nullable().optional(),
    batchId: uuidString.nullable().optional(),
    quantity: z.number().int().positive().max(999).default(1),
    unitPrice: positiveDecimal,
  })
  .strict()
  .refine((row) => !(row.inventoryItemId && row.batchId), {
    message: "Bitta qatorda ham birlik, ham partiya bo'lmaydi",
    path: ['batchId'],
  })
  // Seriyali birlik — bitta jismoniy telefon; ikki dona bo'lishi mumkin emas
  .refine((row) => !row.inventoryItemId || row.quantity === 1, {
    message: "Seriyali birlik uchun miqdor 1 bo'lishi kerak",
    path: ['quantity'],
  });
export type SaleItemInput = z.infer<typeof saleItemInputSchema>;

export const createSaleDraftSchema = z
  .object({
    /** §6.1 — naqd savdoda mijoz ixtiyoriy. */
    customerId: uuidString.nullable().optional(),
    kind: z.literal(SaleKind.CASH).default(SaleKind.CASH),
    /** §1.9 — bitta savdo, bitta valyuta. */
    currency: z.enum(Currency),
    /** §7.5 — 7 kungacha orqaga; chegara serverda, do'kon zonasi bo'yicha. */
    soldAt: isoDateTime.optional(),
    items: z.array(saleItemInputSchema).max(100).default([]),
    note,
  })
  .strict();
export type CreateSaleDraftInput = z.infer<typeof createSaleDraftSchema>;

/**
 * Qoralamani yangilash — savat butunlay almashtiriladi.
 *
 * Qator-qator `PATCH` ataylab emas: savat telefonda tez o'zgaradi va
 * qisman yangilanishlar ketma-ketligi yo'qolgan so'rov tufayli yarim
 * holatga tushib qolardi. To'liq almashtirishda oxirgi yuborilgan savat
 * har doim ekrandagisiga teng.
 */
export const updateSaleDraftSchema = z
  .object({
    customerId: uuidString.nullable().optional(),
    currency: z.enum(Currency).optional(),
    soldAt: isoDateTime.optional(),
    items: z.array(saleItemInputSchema).max(100).optional(),
    note,
    expectedUpdatedAt: expectedUpdatedAt.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedUpdatedAt'), {
    message: "O'zgartirish uchun kamida bitta maydon yuboring",
  });
export type UpdateSaleDraftInput = z.infer<typeof updateSaleDraftSchema>;

/**
 * Tasdiqlashdagi to'lov (§7.1 — aralash to'lov).
 *
 * `cashAccountId` **har doim** kerak, o'tkazmada ham: pul qaysi hisobga
 * tushishi to'lov yaratilganda ma'lum bo'lishi kerak. Kassa yozuvi esa
 * faqat to'lov `CONFIRMED` bo'lganda paydo bo'ladi (§17.2), ya'ni
 * o'tkazma tasdiqlangunicha kassa qoldig'iga ta'sir qilmaydi.
 */
export const salePaymentInputSchema = z
  .object({
    method: z.enum(PaymentMethod),
    /** Haqiqatda berilgan summa, o'z valyutasida (§10). */
    amount: positiveDecimal,
    currency: z.enum(Currency),
    cashAccountId: uuidString,
    note,
  })
  .strict();
export type SalePaymentInput = z.infer<typeof salePaymentInputSchema>;

export const confirmSaleSchema = z
  .object({
    payments: z.array(salePaymentInputSchema).min(1, "Kamida bitta to'lov kiriting").max(10),
    /** Tasdiqlash paytida sanani oxirgi marta to'g'irlash mumkin (§7.5). */
    soldAt: isoDateTime.optional(),
  })
  .strict();
export type ConfirmSaleInput = z.infer<typeof confirmSaleSchema>;

/**
 * Qaytariladigan qator (§8.4 — qisman qaytarish).
 *
 * `quantity` **majburiy va aniq**: "hammasini qaytar" degan qisqartma
 * ataylab yo'q. Miqdorli mahsulotda qisman qaytarish odatiy hol, ya'ni
 * standart qiymat qo'yilsa u ko'pincha noto'g'ri bo'lardi — foydalanuvchi
 * esa buni faqat ombor qoldig'i o'zgargandan keyin sezardi.
 */
export const returnSaleItemSchema = z
  .object({
    saleItemId: uuidString,
    quantity: z.number().int().positive().max(999),
  })
  .strict();
export type ReturnSaleItemInput = z.infer<typeof returnSaleItemSchema>;

/**
 * Qaytarish (§8) — mahsulot haqiqatan qaytib keldi.
 *
 * Sana **yuborilmaydi**: §8.7 qaytarish o'z sanasiga yozilishini talab
 * qiladi, ya'ni uni tanlash imkoniyati o'sha talabni buzish yo'lidan
 * boshqa narsa emas. Shu tufayli §8.8 muddat cheklovini ham kerak
 * qilmaydi — o'tgan davr aylanmasi baribir o'zgarmaydi.
 *
 * `reason` majburiy (§8.6) va `OTHER` tanlansa `note` ham talab qilinadi:
 * "boshqa" degan yozuv oradan bir oy o'tib hech narsani tushuntirmaydi.
 */
export const returnSaleSchema = z
  .object({
    items: z.array(returnSaleItemSchema).min(1, 'Kamida bitta qator tanlang').max(100),
    reason: z.enum(ReversalReason),
    note,
  })
  .strict()
  .refine((value) => value.reason !== ReversalReason.OTHER || Boolean(value.note?.trim()), {
    message: '"Boshqa" sababda izoh yozing',
    path: ['note'],
  });
export type ReturnSaleInput = z.infer<typeof returnSaleSchema>;

/**
 * Bekor qilish (§8, §16.5) — savdo xato kiritilgan, jismonan hech narsa
 * bo'lmagan.
 *
 * Qatorlar tanlanmaydi: qisman bekor qilish degan tushuncha yo'q. "Savdo
 * umuman bo'lmagandek" degani — hammasi yoki hech narsa; yarmi bekor
 * qilingan savdo esa aynan qaytarishning o'zi bo'lardi.
 */
export const cancelSaleSchema = z
  .object({
    reason: z.enum(ReversalReason),
    note,
  })
  .strict()
  .refine((value) => value.reason !== ReversalReason.OTHER || Boolean(value.note?.trim()), {
    message: '"Boshqa" sababda izoh yozing',
    path: ['note'],
  });
export type CancelSaleInput = z.infer<typeof cancelSaleSchema>;

export const saleQuerySchema = z
  .object({
    status: enumList(SaleStatus, 'Kamida bitta holat tanlang').optional(),
    customerId: uuidString.optional(),
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    sort: z.enum(['soldAt', '-soldAt']).default('-soldAt'),
    ...pageQueryFields,
  })
  .strict();
export type SaleQuery = z.infer<typeof saleQuerySchema>;

// ──────────────────────────────── Javoblar ────────────────────────────────

export interface SaleItemDto {
  id: string;
  productId: string;
  productName: string;
  inventoryItemId: string | null;
  batchId: string | null;
  quantity: number;
  unitPrice: string;
  /** §7.11 — tannarx snapshot o'z valyutasi bilan; `SELLER` uchun `null` (P7). */
  costSnapshot: string | null;
  costCurrency: Currency | null;
  suggestedPriceSnapshot: string | null;
  returnedQuantity: number;
}

export interface SalePaymentDto {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  paidAmount: string;
  paidCurrency: Currency;
  appliedAmount: string;
  appliedCurrency: Currency;
  cashAccountId: string | null;
  cashAccountName: string | null;
  paidAt: string;
  confirmedAt: string | null;
}

export interface SaleSummaryDto {
  id: string;
  /** §17.1 — qoralamada raqam yo'q. */
  number: string | null;
  kind: SaleKind;
  status: SaleStatus;
  currency: Currency;
  total: string;
  soldAt: string;
  customerId: string | null;
  customerName: string | null;
  itemCount: number;
  /**
   * §17.4 — teskari yozuv ham oddiy `sales` qatori, ya'ni u ro'yxatga
   * ham tushadi. Bu maydonsiz ro'yxatda manfiy summali "savdo" paydo
   * bo'lardi va uning nima ekani faqat raqamdagi `-R1` dan taxmin
   * qilinardi.
   */
  reversesSaleId: string | null;
  reversalKind: ReversalKind | null;
}

export interface SaleDto extends SaleSummaryDto {
  /** §1.7 — tasdiqlashda yoziladi; qoralamada `null`. */
  exchangeRate: string | null;
  note: string | null;
  items: SaleItemDto[];
  payments: SalePaymentDto[];
  /**
   * §7.9 — savat foydasi (sotuv − tannarx), savdo valyutasida.
   * `SELLER` uchun `null` (`PERMISSIONS.md` P7).
   */
  profit: string | null;
  confirmedAt: string | null;
  /** §8.6 — sabab teskari yozuvning o'zida turadi; asl savdoda `null`. */
  reversalReason: ReversalReason | null;
  reversalNote: string | null;
  /**
   * Shu savdo ustiga yozilgan teskari qatorlar (§17.4). Asl savdoning
   * `status` va `returnedQuantity` si — ulardan hosila kesh, ya'ni
   * karta "nima uchun qaytarilgan" degan savolga shu ro'yxatdan javob
   * beradi, keshdan emas.
   */
  reversals: SaleSummaryDto[];
  createdAt: string;
  updatedAt: string;
}
