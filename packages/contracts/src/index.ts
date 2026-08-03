// Common Enums for Baraka Mobile CRM (HisobAI)

export enum InventoryItemStatus {
  AVAILABLE = 'AVAILABLE',
  RESERVED = 'RESERVED',
  SOLD = 'SOLD',
  RETURNED = 'RETURNED',
}

export enum StockMovementType {
  RECEIVE = 'RECEIVE',
  SALE = 'SALE',
  RETURN = 'RETURN',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum SaleKind {
  CASH = 'CASH',
  INSTALLMENT = 'INSTALLMENT',
  MIXED = 'MIXED',
}

export enum SaleStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  REVERSED = 'REVERSED',
  CANCELLED = 'CANCELLED',
}

export enum InstallmentStatus {
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export enum ScheduleStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  PARTIAL = 'PARTIAL',
  OVERDUE = 'OVERDUE',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD_TRANSFER = 'CARD_TRANSFER',
  MIXED = 'MIXED',
}

export enum PaymentStatus {
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  REVERSED = 'REVERSED',
}

export enum CashDirection {
  CASH_IN = 'CASH_IN',
  CASH_OUT = 'CASH_OUT',
}

export enum NotificationChannel {
  WEB_PUSH = 'WEB_PUSH',
  SMS = 'SMS',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

// Auth Contracts
export interface AdminProfile {
  id: string;
  email: string;
  displayName: string;
  theme: string;
}

export interface AuthResponse {
  admin: AdminProfile;
  sessionToken?: string;
  expiresAt: string;
}

// Customer Contracts
export interface CreateCustomerDto {
  fullName: string;
  phone: string;
  address?: string;
  note?: string;
}

export interface CustomerDto {
  id: string;
  fullName: string;
  phoneE164: string;
  address?: string | null;
  note?: string | null;
  totalDebt: number;
  salesCount: number;
  activeContractsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDetailDto extends CustomerDto {
  sales: any[];
  payments: any[];
  installmentContracts: any[];
}

// Catalog Contracts
export interface CreateProductDto {
  category: string;
  brand: string;
  model: string;
  storage?: string;
  color?: string;
  isSerialized?: boolean;
  defaultSalePrice: number;
  minStockAlert?: number;
}

export interface ProductDto {
  id: string;
  category: string;
  brand: string;
  model: string;
  storage?: string | null;
  color?: string | null;
  isSerialized: boolean;
  defaultSalePrice: number;
  minStockAlert: number;
  createdAt: string;
  updatedAt: string;
}

// Inventory Contracts
export interface ReceiveStockDto {
  productId: string;
  imei?: string;
  serialNumber?: string;
  costPrice: number;
  quantity?: number;
  receivedAt?: string;
}

export interface InventoryItemDto {
  id: string;
  productId: string;
  product?: ProductDto;
  imei?: string | null;
  serialNumber?: string | null;
  costPrice: number;
  status: InventoryItemStatus;
  receivedAt: string;
  createdAt: string;
}

export interface LowStockAlertDto {
  product: ProductDto;
  availableQuantity: number;
  minStockAlert: number;
}

// Sales Contracts
export interface CreateSaleItemDto {
  inventoryItemId?: string;
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateSaleDto {
  customerId?: string;
  kind: SaleKind;
  discount?: number;
  items: CreateSaleItemDto[];
}

export interface ConfirmSaleDto {
  downPayment?: number;
  installmentMonths?: number;
  startDate?: string;
}

export interface SaleItemDto {
  id: string;
  saleId: string;
  inventoryItemId?: string | null;
  productId: string;
  product?: ProductDto;
  inventoryItem?: InventoryItemDto;
  quantity: number;
  unitPrice: number;
  costSnapshot: number;
  createdAt: string;
}

export interface SaleDto {
  id: string;
  customerId?: string | null;
  customer?: CustomerDto;
  kind: SaleKind;
  status: SaleStatus;
  subtotal: number;
  discount: number;
  total: number;
  soldAt: string;
  saleItems: SaleItemDto[];
  installmentContract?: any;
  createdAt: string;
  updatedAt: string;
}

// Payments & Installments Contracts
export interface CreatePaymentDto {
  contractId: string;
  amount: number;
  method: PaymentMethod;
  receiptUrl?: string;
}

export interface PaymentDto {
  id: string;
  contractId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  receiptUrl?: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentScheduleDto {
  id: string;
  contractId: string;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  status: ScheduleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateScheduleItemDto {
  dueDate: string;
  amountDue: number;
}

export interface UpdateScheduleDto {
  schedules: UpdateScheduleItemDto[];
}

export interface InstallmentContractDto {
  id: string;
  saleId: string;
  customerId: string;
  customer?: CustomerDto;
  sale?: SaleDto;
  principal: number;
  downPayment: number;
  outstandingAmount: number;
  status: InstallmentStatus;
  paymentSchedules: PaymentScheduleDto[];
  payments: PaymentDto[];
  createdAt: string;
  updatedAt: string;
}

// Dashboard Contracts
export interface SalesDynamicsPoint {
  date: string;
  revenue: number;
  salesCount: number;
}

export interface RecentActivityItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  type: 'sale' | 'payment' | 'inventory' | 'customer';
}

export interface DashboardSummary {
  todaySalesCount: number;
  todayRevenue: number;
  todayCashSales: number;
  todayInstallmentSales: number;
  todayCashIn: number;
  todayCashOut: number;
  todayGrossProfit: number;
  totalOutstandingReceivables: number;
  todayDueReceivables: number;
  overdueReceivables: number;
  inventoryTotalValue: number;
  lowStockCount: number;
  salesDynamics: SalesDynamicsPoint[];
  recentActivities: RecentActivityItem[];
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface HealthCheckResponse {
  status: string;
  timestamp: string;
  service: string;
  version: string;
  database: string;
}

// Cashbook Contracts
export interface CashCategoryDto {
  id: string;
  name: string;
  direction: CashDirection;
  isSystem: boolean;
  createdAt: string;
}

export interface CreateCashCategoryDto {
  name: string;
  direction: CashDirection;
}

export interface CashEntryDto {
  id: string;
  direction: CashDirection;
  amount: number;
  occurredAt: string;
  categoryId?: string | null;
  category?: CashCategoryDto | null;
  sourceType?: string | null;
  sourceId?: string | null;
  saleId?: string | null;
  paymentId?: string | null;
  note?: string | null;
  attachmentUrl?: string | null;
  createdAt: string;
}

export interface CreateCashEntryDto {
  direction: CashDirection;
  amount: number;
  categoryId?: string;
  occurredAt?: string;
  note?: string;
  attachmentUrl?: string;
}

// Reports Contracts
export interface TopEntityStat {
  name: string;
  count: number;
  revenue: number;
}

export interface ReportSummaryDto {
  dateRange: {
    from: string;
    to: string;
  };
  sales: {
    totalTurnover: number;
    totalCount: number;
    cashSales: { amount: number; count: number };
    installmentSales: { amount: number; count: number };
    mixedSales: { amount: number; count: number };
  };
  cashFlow: {
    cashIn: number;
    cashOut: number;
    netCashFlow: number;
  };
  profitability: {
    grossProfit: number;
    costOfGoodsSold: number;
    grossMarginPercent: number;
  };
  installmentDebt: {
    totalOutstanding: number;
    collectedAmount: number;
    overdueAmount: number;
    activeContractsCount: number;
  };
  inventory: {
    totalCount: number;
    totalValue: number;
    lowStockCount: number;
  };
  topBrands: TopEntityStat[];
  topModels: TopEntityStat[];
  topCategories: TopEntityStat[];
}

