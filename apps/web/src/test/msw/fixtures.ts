import {
  CashAccountKind,
  Currency,
  ExchangeRateSource,
  InventoryStatus,
  ProductType,
  RateStaleness,
  SaleKind,
  SaleStatus,
  Theme,
  UserRole,
} from '@hisobai/contracts';
import type {
  CashAccountDto,
  CurrentUserDto,
  InventoryItemDto,
  ProductDto,
  SaleDto,
  TodayExchangeRateDto,
} from '@hisobai/contracts';

/**
 * Testlar uchun umumiy tayyor ma'lumot (`FRONTEND.md` §13).
 *
 * Bitta joyda: `sale-form.test.tsx` va boshqa testlar bir xil `id`
 * qiymatlariga tayanadi (masalan mahsulot ↔ ombor birligi bog'lanishi),
 * ikki joyda ikki xil yozilsa bittasi eskirib qolib, MSW javobi
 * komponent kutgan qatordan boshqasini qaytarardi.
 *
 * **Nega `id` lar haqiqiy UUID formatida.** `saleItemInputSchema` va
 * `salePaymentInputSchema` (`@hisobai/contracts/schemas/sale.ts`)
 * `uuidString` (`z.uuid()`) bilan tekshiradi — forma tasdiqlashdan oldin
 * `createSaleDraftSchema`/`confirmSaleSchema` orqali **client tomonda**
 * o'tadi (`FRONTEND.md` §6.1). ID `"product-1"` kabi o'qish uchun qulay
 * lekin UUID bo'lmagan qator bo'lsa, forma hech qachon serverga
 * yetmasdan "Identifikator noto'g'ri" bilan to'xtab qolardi.
 */

export const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
export const INVENTORY_ITEM_ID = '33333333-3333-4333-8333-333333333333';
export const CASH_ACCOUNT_UZS_ID = '44444444-4444-4444-8444-444444444444';
export const CASH_ACCOUNT_USD_ID = '55555555-5555-4555-8555-555555555555';
export const SALE_ID = '11111111-1111-4111-8111-111111111111';

export const mockUser: CurrentUserDto = {
  id: '66666666-6666-4666-8666-666666666666',
  email: 'admin@do-kon.uz',
  displayName: 'Test Admin',
  role: UserRole.SHOP_ADMIN,
  theme: Theme.SYSTEM,
  shopId: '77777777-7777-4777-8777-777777777777',
};

/** Seriyali mahsulot — savat qatoriga IMEI tanlash orqali qo'shiladi. */
export const mockProduct: ProductDto = {
  id: PRODUCT_ID,
  categoryId: '88888888-8888-4888-8888-888888888888',
  categoryName: 'Telefonlar',
  brandId: '99999999-9999-4999-8999-999999999999',
  brandName: 'Apple',
  model: 'iPhone 13',
  storage: '128GB',
  color: 'Qora',
  displayName: 'Apple iPhone 13 128GB Qora',
  type: ProductType.SERIALIZED,
  currency: Currency.UZS,
  suggestedPrice: '1000000',
  lastCostPrice: '800000',
  lowStockThreshold: null,
  description: null,
  isActive: true,
  stock: { available: 1, isLowStock: false },
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

export const mockInventoryItem: InventoryItemDto = {
  id: INVENTORY_ITEM_ID,
  productId: mockProduct.id,
  product: {
    id: mockProduct.id,
    displayName: mockProduct.displayName,
    type: mockProduct.type,
    currency: mockProduct.currency,
  },
  imei1: '123456789012345',
  imei2: null,
  serialNumber: null,
  costPrice: '800000',
  costCurrency: Currency.UZS,
  status: InventoryStatus.AVAILABLE,
  receivedAt: '2026-08-01T00:00:00.000Z',
  returnReason: null,
  note: null,
  updatedAt: '2026-08-01T00:00:00.000Z',
};

export const mockCashAccountUzs: CashAccountDto = {
  id: CASH_ACCOUNT_UZS_ID,
  name: 'Kassa (naqd so‘m)',
  currency: Currency.UZS,
  kind: CashAccountKind.CASH,
  isActive: true,
  sortOrder: 0,
  updatedAt: '2026-08-01T00:00:00.000Z',
};

export const mockCashAccountUsd: CashAccountDto = {
  id: CASH_ACCOUNT_USD_ID,
  name: 'Kassa (dollar)',
  currency: Currency.USD,
  kind: CashAccountKind.CASH,
  isActive: true,
  sortOrder: 1,
  updatedAt: '2026-08-01T00:00:00.000Z',
};

/** §1.7 — do'kon kursi: 1 USD = 12 700 UZS. */
export const mockTodayRate: TodayExchangeRateDto = {
  today: '2026-08-16',
  rate: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    date: '2026-08-16',
    cbuRate: '12650',
    storeRate: '12700',
    source: ExchangeRateSource.CBU,
    fetchedAt: '2026-08-16T04:00:00.000Z',
    updatedById: null,
    updatedAt: '2026-08-16T04:00:00.000Z',
  },
  isStale: false,
  staleDays: 0,
  staleness: RateStaleness.FRESH,
};

/**
 * `/sales/[id]` sahifasida ochilgan mavjud qoralama — savat allaqachon
 * bitta qator bilan to'ldirilgan, faqat to'lov kiritish qoladi. Sabab:
 * mahsulot/IMEI tanlashni har testda takrorlash idempotency testining
 * diqqatini asosiy masaladan chalg'itardi.
 */
export function mockDraftSale(overrides: Partial<SaleDto> = {}): SaleDto {
  return {
    id: SALE_ID,
    number: null,
    kind: SaleKind.CASH,
    status: SaleStatus.DRAFT,
    currency: Currency.UZS,
    total: '1000000',
    soldAt: '2026-08-16T10:00:00+05:00',
    customerId: null,
    customerName: null,
    itemCount: 1,
    reversesSaleId: null,
    reversalKind: null,
    exchangeRate: null,
    note: null,
    items: [
      {
        id: 'item-1',
        productId: mockProduct.id,
        productName: mockProduct.displayName,
        inventoryItemId: mockInventoryItem.id,
        batchId: null,
        quantity: 1,
        unitPrice: '1000000',
        costSnapshot: null,
        costCurrency: null,
        suggestedPriceSnapshot: null,
        returnedQuantity: 0,
      },
    ],
    payments: [],
    profit: null,
    confirmedAt: null,
    reversalReason: null,
    reversalNote: null,
    reversals: [],
    createdAt: '2026-08-16T09:00:00.000Z',
    updatedAt: '2026-08-16T09:00:00.000Z',
    ...overrides,
  };
}
