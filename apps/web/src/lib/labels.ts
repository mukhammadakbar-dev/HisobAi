import { InventoryStatus, ProductType, StockMovementType } from '@hisobai/contracts';
import type { StockAdjustReason } from '@hisobai/contracts';

/**
 * Enum → o'zbekcha atama (`GLOSSARY.md`).
 *
 * Lug'at bir joyda: bir tushuncha ekranda ikki xil nomlansa
 * (masalan "Mavjud" va "Sotuvga tayyor"), foydalanuvchi ularni ikki
 * xil holat deb o'ylaydi.
 */

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
