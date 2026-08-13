import type { Currency } from '../enums';

/**
 * Dashboard javobi (§14).
 *
 * **Bitta so'rov** (§14.1): `GET /dashboard` quyidagi bloklarning
 * hammasini birdaniga qaytaradi — telefon internetida ikkinchi so'rov
 * kutish sahifani sezilarli sekinlashtiradi.
 *
 * Pul maydonlari `API.md` §2.1 bo'yicha **satr**, valyuta esa har
 * blokda aniq ko'rsatiladi: dashboard bazaviy valyutada (UZS, §1.1)
 * o'qiladi, lekin kassa qoldig'i hisob valyutasida turadi.
 *
 * `null` va `undefined` farqi bu yerda **ma'noli**:
 *  - maydon `null` — foydalanuvchi rolida bu blok yopiq
 *    (`PERMISSIONS.md` §2: `SELLER` foyda va kassa bloklarini
 *    ko'rmaydi). Server maydonni butunlay olib tashlamaydi, chunki
 *    UI "yo'q" bilan "ruxsat yo'q" ni ajratishi kerak;
 *  - bo'sh massiv — ma'lumot bor, lekin bugun hech narsa bo'lmagan.
 */

/** §14.3 — bugungi savdo va foyda. */
export interface DashboardSalesDto {
  /** Bugun tasdiqlangan savdolar soni. */
  count: number;
  /** Tushum, bazaviy valyutada. */
  revenue: string;
  /** `PERMISSIONS.md` P7 — `SELLER` uchun `null`. */
  profit: string | null;
}

/** §14.3 — bugun yoki ertaga to'lovi keladigan mijoz. */
export interface DashboardDuePaymentDto {
  installmentId: string;
  customerId: string;
  customerName: string;
  phone: string;
  /** `YYYY-MM-DD`, do'kon zonasida. */
  dueDate: string;
  amount: string;
  currency: Currency;
}

/** §14.3 — kassadagi pul: har hisob o'z valyutasida. */
export interface DashboardCashAccountDto {
  id: string;
  name: string;
  currency: Currency;
  balance: string;
}

/** §14.4 — muddati o'tgan qarzlar. */
export interface DashboardOverdueDto {
  customersCount: number;
  totalAmount: string;
  /** Eng katta bir nechtasi — to'liq ro'yxat `/reports/debts` da. */
  top: DashboardOverdueCustomerDto[];
}

export interface DashboardOverdueCustomerDto {
  customerId: string;
  customerName: string;
  daysOverdue: number;
  amount: string;
}

/** §14.4 — ombor qiymati va kam qolgan mahsulotlar. */
export interface DashboardInventoryDto {
  /** Sotuvga tayyor birliklar soni. */
  availableCount: number;
  /** Tannarx bo'yicha qiymat; `SELLER` uchun `null` (P7). */
  totalCost: string | null;
  lowStock: DashboardLowStockDto[];
}

export interface DashboardLowStockDto {
  productId: string;
  productName: string;
  quantity: number;
  threshold: number;
}

/** §14.4 — so'nggi amallar (savdo, to'lov, qabul, kassa yozuvi). */
export interface DashboardActivityDto {
  id: string;
  /** O'zbekcha tayyor satr — UI turlar ro'yxatini takrorlamasligi uchun. */
  title: string;
  at: string;
  amount: string | null;
  currency: Currency | null;
}

/** §14.4 — grafik: kunlik tushum. */
export interface DashboardChartPointDto {
  /** `YYYY-MM-DD`. */
  date: string;
  revenue: string;
}

export interface DashboardDto {
  /** Do'kon zonasidagi bugungi sana (§14.2) — javob qaysi kunga tegishli. */
  date: string;
  /** Bazaviy valyuta (§1.1) — pul maydonlarining aksariyati shunda. */
  currency: Currency;
  sales: DashboardSalesDto;
  duePayments: DashboardDuePaymentDto[];
  /** `SELLER` uchun `null` — kassa bloki yopiq. */
  cashAccounts: DashboardCashAccountDto[] | null;
  overdue: DashboardOverdueDto;
  inventory: DashboardInventoryDto;
  recentActivity: DashboardActivityDto[];
  /** So'nggi 14 kun — grafik uchun (§14.4). */
  chart: DashboardChartPointDto[];
}
