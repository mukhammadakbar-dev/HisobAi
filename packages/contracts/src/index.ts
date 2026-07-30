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
