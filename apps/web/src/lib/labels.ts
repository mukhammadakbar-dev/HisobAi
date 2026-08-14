import {
  AccountStatus,
  CashAccountKind,
  CashDirection,
  CashSourceType,
  InventoryStatus,
  PaymentMethod,
  PaymentStatus,
  ProductType,
  SaleKind,
  SaleStatus,
  StockMovementType,
} from '@hisobai/contracts';
import type { StockAdjustReason } from '@hisobai/contracts';

/**
 * Enum → o'zbekcha atama (`GLOSSARY.md`).
 *
 * Lug'at bir joyda: bir tushuncha ekranda ikki xil nomlansa
 * (masalan "Mavjud" va "Sotuvga tayyor"), foydalanuvchi ularni ikki
 * xil holat deb o'ylaydi.
 */

/** §21.6, §25.19 — SHOP_ADMIN account holati (platforma paneli). */
export const ACCOUNT_STATUS_LABEL: Record<string, string> = {
  [AccountStatus.ACTIVE]: 'Faol',
  [AccountStatus.SUSPENDED]: 'Vaqtincha to‘xtatilgan',
  [AccountStatus.DISABLED]: 'O‘chirilgan',
};

export const ACCOUNT_STATUS_TONE: Record<string, 'success' | 'warning' | 'muted'> = {
  [AccountStatus.ACTIVE]: 'success',
  [AccountStatus.SUSPENDED]: 'warning',
  [AccountStatus.DISABLED]: 'muted',
};

export const PRODUCT_TYPE_LABEL: Record<string, string> = {
  [ProductType.SERIALIZED]: 'Seriyali',
  [ProductType.QUANTITY]: 'Miqdorli',
};

export const INVENTORY_STATUS_LABEL: Record<string, string> = {
  [InventoryStatus.AVAILABLE]: 'Mavjud',
  [InventoryStatus.SOLD]: 'Sotilgan',
  [InventoryStatus.RETURNED]: 'Qaytarilgan',
  [InventoryStatus.WRITTEN_OFF]: 'Chiqarilgan',
};

/** `Badge` ohangi — rang yagona signal emas, matn har doim yonida (TZ §20). */
export const INVENTORY_STATUS_TONE: Record<string, 'success' | 'muted' | 'warning' | 'danger'> = {
  [InventoryStatus.AVAILABLE]: 'success',
  [InventoryStatus.SOLD]: 'muted',
  [InventoryStatus.RETURNED]: 'warning',
  [InventoryStatus.WRITTEN_OFF]: 'danger',
};

export const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  [StockMovementType.RECEIVE]: 'Qabul',
  [StockMovementType.SALE]: 'Sotuv',
  [StockMovementType.RETURN]: 'Qaytarish',
  [StockMovementType.ADJUST]: 'Tuzatish',
  [StockMovementType.PERSONAL_USE]: 'Shaxsiy foydalanish',
};

export const ADJUST_REASON_LABEL: Record<StockAdjustReason, string> = {
  LOST: "Yo'qolgan",
  DEFECTIVE: 'Nuqsonli',
  MISCOUNT: 'Xato hisob',
  OTHER: 'Boshqa',
};

// ──────────────────────────────── Savdo (§7) ────────────────────────────────

export const SALE_KIND_LABEL: Record<string, string> = {
  [SaleKind.CASH]: 'Naqd',
  [SaleKind.INSTALLMENT]: 'Nasiya',
};

export const SALE_STATUS_LABEL: Record<string, string> = {
  [SaleStatus.DRAFT]: 'Qoralama',
  [SaleStatus.CONFIRMED]: 'Tasdiqlangan',
  [SaleStatus.PARTIALLY_RETURNED]: 'Qisman qaytarilgan',
  [SaleStatus.RETURNED]: 'Qaytarilgan',
  [SaleStatus.CANCELLED]: 'Bekor qilingan',
  [SaleStatus.REVERSAL]: 'Teskari yozuv',
};

export const SALE_STATUS_TONE: Record<string, 'success' | 'muted' | 'warning' | 'danger' | 'info'> =
  {
    [SaleStatus.DRAFT]: 'info',
    [SaleStatus.CONFIRMED]: 'success',
    [SaleStatus.PARTIALLY_RETURNED]: 'warning',
    [SaleStatus.RETURNED]: 'warning',
    [SaleStatus.CANCELLED]: 'muted',
    [SaleStatus.REVERSAL]: 'danger',
  };

// ──────────────────────────────── To'lovlar (§10) ────────────────────────────────

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  [PaymentMethod.CASH]: 'Naqd',
  [PaymentMethod.CARD]: 'Karta',
  [PaymentMethod.TRANSFER]: "O'tkazma",
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  [PaymentStatus.PENDING_VERIFICATION]: 'Tekshirilmoqda',
  [PaymentStatus.CONFIRMED]: 'Tasdiqlangan',
  [PaymentStatus.REJECTED]: 'Rad etilgan',
  [PaymentStatus.REVERSED]: 'Qaytarilgan',
};

export const PAYMENT_STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  [PaymentStatus.PENDING_VERIFICATION]: 'warning',
  [PaymentStatus.CONFIRMED]: 'success',
  [PaymentStatus.REJECTED]: 'danger',
  [PaymentStatus.REVERSED]: 'muted',
};

// ──────────────────────────────── Kassa (§11) ────────────────────────────────

export const CASH_ACCOUNT_KIND_LABEL: Record<string, string> = {
  [CashAccountKind.CASH]: 'Naqd',
  [CashAccountKind.BANK]: 'Bank',
  [CashAccountKind.CARD]: 'Karta',
};

export const CASH_DIRECTION_LABEL: Record<string, string> = {
  [CashDirection.IN]: 'Kirim',
  [CashDirection.OUT]: 'Chiqim',
};

export const CASH_SOURCE_LABEL: Record<string, string> = {
  [CashSourceType.PAYMENT]: "To'lovdan",
  [CashSourceType.MANUAL]: "Qo'lda",
  [CashSourceType.OPENING_BALANCE]: "Boshlang'ich qoldiq",
  [CashSourceType.EXCHANGE]: 'Ayirboshlash',
  [CashSourceType.REVERSAL]: 'Teskari yozuv',
};
