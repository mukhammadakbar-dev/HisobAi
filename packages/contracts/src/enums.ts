/**
 * Domen enumlari. API va web shu yerdan oladi — atama ikki joyda ikki xil
 * yozilmasin. Prisma schema'sidagi enumlar shular bilan bir xil bo'lishi shart.
 *
 * TS `enum` emas, `as const` obyekt ishlatiladi: `isolatedModules` bilan
 * muammosiz va runtime'da oddiy string bo'lib qoladi.
 */

/** §1.1 — bazaviy valyuta UZS, USD qo'llab-quvvatlanadi. */
export const Currency = {
  UZS: 'UZS',
  USD: 'USD',
} as const;
export type Currency = (typeof Currency)[keyof typeof Currency];

/** §1.1 — hisobot va jamlash valyutasi. */
export const BASE_CURRENCY: Currency = Currency.UZS;

/**
 * §1.10 — yaxlitlash: UZS butun songacha (tiyin ishlatilmaydi), USD 2 xona.
 * Yaxlitlash yozishdan oldin qilinadi, ko'rsatishda emas.
 */
export const CURRENCY_SCALE: Record<Currency, number> = {
  UZS: 0,
  USD: 2,
};

/**
 * §2.1, §16.14 — MVP'da faqat OWNER.
 *
 * `MANAGER` va `SELLER` ataylab YO'Q: amalga oshirilmagan rol — sinovdan
 * o'tmagan xavfsizlik kodi, ya'ni xavfsizlik illyuziyasi. Ikkinchi xodim
 * paydo bo'lganda `docs/PERMISSIONS.md` dagi matritsa bo'yicha qo'shiladi
 * (PostgreSQL'da `ALTER TYPE ... ADD VALUE` — arzon amal).
 */
export const UserRole = {
  OWNER: 'OWNER',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const Theme = {
  SYSTEM: 'SYSTEM',
  LIGHT: 'LIGHT',
  DARK: 'DARK',
} as const;
export type Theme = (typeof Theme)[keyof typeof Theme];

/** §3.5 — kurs manbai. */
export const ExchangeRateSource = {
  CBU: 'CBU',
  MANUAL: 'MANUAL',
} as const;
export type ExchangeRateSource = (typeof ExchangeRateSource)[keyof typeof ExchangeRateSource];

/** §5.1, §5.2 — seriyali birlik yoki partiyali miqdor. */
export const ProductType = {
  SERIALIZED: 'SERIALIZED',
  QUANTITY: 'QUANTITY',
} as const;
export type ProductType = (typeof ProductType)[keyof typeof ProductType];

/** §5.4 — "rezerv" holati yo'q: qoralama mahsulotni ushlab turmaydi. */
export const InventoryStatus = {
  AVAILABLE: 'AVAILABLE',
  SOLD: 'SOLD',
  RETURNED: 'RETURNED',
  WRITTEN_OFF: 'WRITTEN_OFF',
} as const;
export type InventoryStatus = (typeof InventoryStatus)[keyof typeof InventoryStatus];

/** §5.10 — ombor harakati hech qachon o'chirilmaydi. */
export const StockMovementType = {
  RECEIVE: 'RECEIVE',
  SALE: 'SALE',
  RETURN: 'RETURN',
  ADJUST: 'ADJUST',
  PERSONAL_USE: 'PERSONAL_USE',
} as const;
export type StockMovementType = (typeof StockMovementType)[keyof typeof StockMovementType];

/** §5.7 — tuzatish sababi; hisobotda sabablar ajratiladi. */
export const StockAdjustReason = {
  LOST: 'LOST',
  DEFECTIVE: 'DEFECTIVE',
  MISCOUNT: 'MISCOUNT',
  OTHER: 'OTHER',
} as const;
export type StockAdjustReason = (typeof StockAdjustReason)[keyof typeof StockAdjustReason];

export const StocktakeStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type StocktakeStatus = (typeof StocktakeStatus)[keyof typeof StocktakeStatus];

export const SaleKind = {
  CASH: 'CASH',
  INSTALLMENT: 'INSTALLMENT',
} as const;
export type SaleKind = (typeof SaleKind)[keyof typeof SaleKind];

/**
 * §7 — qoralama hech narsaga ta'sir qilmaydi; tasdiqlangani o'zgarmaydi.
 *
 * §17.4 — `REVERSAL`: qaytarish/bekor qilish teskari yozuvi. U alohida `sales`
 * qatori (`reversesSaleId`, manfiy `total`, raqami `2026-00147-R1`) va
 * qaytarish bo'yicha YAGONA haqiqat manbai. `PARTIALLY_RETURNED`/`RETURNED`
 * hamda `saleItems.returnedQuantity` — undan hosila kesh.
 */
export const SaleStatus = {
  DRAFT: 'DRAFT',
  CONFIRMED: 'CONFIRMED',
  PARTIALLY_RETURNED: 'PARTIALLY_RETURNED',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
  REVERSAL: 'REVERSAL',
} as const;
export type SaleStatus = (typeof SaleStatus)[keyof typeof SaleStatus];

/** §8 — bekor qilish va qaytarish qat'iy ajratiladi. */
export const ReversalKind = {
  RETURN: 'RETURN',
  CANCEL: 'CANCEL',
} as const;
export type ReversalKind = (typeof ReversalKind)[keyof typeof ReversalKind];

/** §8.6 — sabab majburiy. */
export const ReversalReason = {
  DEFECTIVE: 'DEFECTIVE',
  CUSTOMER_CHANGED_MIND: 'CUSTOMER_CHANGED_MIND',
  ENTRY_ERROR: 'ENTRY_ERROR',
  OTHER: 'OTHER',
} as const;
export type ReversalReason = (typeof ReversalReason)[keyof typeof ReversalReason];

/** §9.7 — "muddati o'tgan" holat emas, sanadan hisoblanadi (§9.8). */
export const ContractStatus = {
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
} as const;
export type ContractStatus = (typeof ContractStatus)[keyof typeof ContractStatus];

/** §9.8 — OVERDUE bu yerda yo'q: `due_date < bugun` va qarz qolganidan hisoblanadi. */
export const ScheduleStatus = {
  UNPAID: 'UNPAID',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
} as const;
export type ScheduleStatus = (typeof ScheduleStatus)[keyof typeof ScheduleStatus];

export const PaymentMethod = {
  CASH: 'CASH',
  CARD: 'CARD',
  TRANSFER: 'TRANSFER',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/** §10 — faqat CONFIRMED qarzni kamaytiradi va kassaga tushadi. */
export const PaymentStatus = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  REVERSED: 'REVERSED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/** §11.1 — karta puli kassa yashigida yo'q, shuning uchun hisoblar ajratiladi. */
export const CashAccountKind = {
  CASH: 'CASH',
  BANK: 'BANK',
  CARD: 'CARD',
} as const;
export type CashAccountKind = (typeof CashAccountKind)[keyof typeof CashAccountKind];

export const CashDirection = {
  IN: 'IN',
  OUT: 'OUT',
} as const;
export type CashDirection = (typeof CashDirection)[keyof typeof CashDirection];

/**
 * §11.7 — MANUAL bo'lmagan yozuv qo'lda tahrirlanmaydi.
 * §11.4, §11.6 — OPENING_BALANCE va EXCHANGE daromad deb sanalmaydi.
 *
 * §17.2 — `SALE` YO'Q: kassaga pul faqat `Payment` orqali tushadi. Savdo
 *   to'g'ridan-to'g'ri kassa yozuvi yaratsa, bir pul ikki yo'ldan yozilib
 *   ikki marta sanalardi — bu jim moliyaviy xato.
 * §17.12 — `PERSONAL_USE` YO'Q: shaxsiy foydalanishda kassadan pul chiqmaydi.
 *   U pul bo'lmagan xarajat va `stockMovements` dan hisoblanadi. Kassa yozuvi
 *   yaratilsa, qoldiq jismoniy naqd puldan farq qilardi (§11.3).
 */
export const CashSourceType = {
  PAYMENT: 'PAYMENT',
  MANUAL: 'MANUAL',
  OPENING_BALANCE: 'OPENING_BALANCE',
  EXCHANGE: 'EXCHANGE',
  REVERSAL: 'REVERSAL',
} as const;
export type CashSourceType = (typeof CashSourceType)[keyof typeof CashSourceType];

/** Hisobotda daromad sifatida sanalmaydigan manbalar (§11.4, §11.6). */
export const NON_INCOME_CASH_SOURCES: readonly CashSourceType[] = [
  CashSourceType.OPENING_BALANCE,
  CashSourceType.EXCHANGE,
];

export const FileKind = {
  PASSPORT: 'PASSPORT',
  RECEIPT: 'RECEIPT',
  PRODUCT_IMAGE: 'PRODUCT_IMAGE',
  CASH_ATTACHMENT: 'CASH_ATTACHMENT',
  SHOP_LOGO: 'SHOP_LOGO',
  CONTRACT_PDF: 'CONTRACT_PDF',
} as const;
export type FileKind = (typeof FileKind)[keyof typeof FileKind];

/** §15.1 — MVP'da faqat nasiya shartnomasi PDF'i. */
export const DocumentType = {
  INSTALLMENT_CONTRACT: 'INSTALLMENT_CONTRACT',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const NotificationChannel = {
  PUSH: 'PUSH',
  SMS: 'SMS',
} as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationType = {
  PAYMENT_DUE_REMINDER: 'PAYMENT_DUE_REMINDER',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

/** PROCESSING — idempotency uchun: xabarni faqat bitta worker oladi. */
export const NotificationStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;
export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];
