/**
 * Xato kodlari registri (`API.md` §3.4).
 *
 * `code` — frontend qaror qabul qiladigan YAGONA maydon. U **barqaror**:
 * bir marta e'lon qilingandan keyin o'zgartirilmaydi va olib tashlanmaydi
 * (`API.md` §1 — versiyalash). `message` esa foydalanuvchiga ko'rsatiladi
 * va istalgan vaqtda tahrirlanishi mumkin.
 *
 * Backend ham, web ham shu yerdan oladi — atama ikki joyda ikki xil
 * bo'lmasin.
 */

export const ErrorCode = {
  // ── Umumiy ────────────────────────────────────────────────────────────
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  /** `API.md` §8 — yozuv client o'qigandan keyin o'zgargan. */
  STALE_RESOURCE: 'STALE_RESOURCE',
  /**
   * `API.md` §8 — `expectedUpdatedAt` ham, `If-Unmodified-Since` ham
   * yuborilmagan. `STALE_RESOURCE` dan ataylab ajratilgan: u yerda
   * konflikt bor, bu yerda esa konflikt bor-yo'qligini **aniqlab
   * bo'lmaydi**. Ikkalasi bir kod bo'lsa, qulfni umuman yubormaydigan
   * client "konflikt yo'q" degan yolg'on xulosaga asos berardi.
   */
  PRECONDITION_REQUIRED: 'PRECONDITION_REQUIRED',
  /** Faqat web tomonida yaratiladi — server javob bermadi. */
  NETWORK_ERROR: 'NETWORK_ERROR',

  // ── Idempotency (§17.6) ───────────────────────────────────────────────
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  REQUEST_IN_PROGRESS: 'REQUEST_IN_PROGRESS',

  // ── Auth (§2) ─────────────────────────────────────────────────────────
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_BLOCKED: 'AUTH_BLOCKED',
  AUTH_SESSION_EXPIRED: 'AUTH_SESSION_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_USED: 'AUTH_TOKEN_USED',
  AUTH_CSRF_INVALID: 'AUTH_CSRF_INVALID',
  /** Parol o'zgartirishda joriy parol xato — `AUTH_INVALID_CREDENTIALS` dan
   *  ataylab ajratilgan: bu yerda sessiya haqiqiy, faqat tasdiq muvaffaqiyatsiz. */
  AUTH_CURRENT_PASSWORD_INVALID: 'AUTH_CURRENT_PASSWORD_INVALID',
  /** `users.is_active = false` — parol to'g'ri bo'lsa ham kiritilmaydi. */
  AUTH_USER_INACTIVE: 'AUTH_USER_INACTIVE',

  // ── Savdo (§7, §8) ────────────────────────────────────────────────────
  SALE_NOT_DRAFT: 'SALE_NOT_DRAFT',
  SALE_ALREADY_CONFIRMED: 'SALE_ALREADY_CONFIRMED',
  SALE_EMPTY: 'SALE_EMPTY',
  SALE_ITEM_NOT_AVAILABLE: 'SALE_ITEM_NOT_AVAILABLE',
  SALE_INSUFFICIENT_STOCK: 'SALE_INSUFFICIENT_STOCK',
  SALE_CUSTOMER_REQUIRED: 'SALE_CUSTOMER_REQUIRED',
  /** §17.10 — naqd savdo to'liq to'lanishi shart. */
  SALE_PAYMENT_MISMATCH: 'SALE_PAYMENT_MISMATCH',
  /** §7.5 — 7 kungacha orqaga. */
  SALE_DATE_OUT_OF_RANGE: 'SALE_DATE_OUT_OF_RANGE',
  /** §16.5 — bekor qilish faqat 7 kun ichida. */
  SALE_CANCEL_WINDOW_EXPIRED: 'SALE_CANCEL_WINDOW_EXPIRED',
  SALE_ALREADY_RETURNED: 'SALE_ALREADY_RETURNED',
  SALE_REVERSAL_REASON_REQUIRED: 'SALE_REVERSAL_REASON_REQUIRED',

  // ── Nasiya (§9) ───────────────────────────────────────────────────────
  INSTALLMENT_SCHEDULE_SUM_MISMATCH: 'INSTALLMENT_SCHEDULE_SUM_MISMATCH',
  /** §9.10 — to'langan qatorga tegib bo'lmaydi. */
  INSTALLMENT_SCHEDULE_ROW_PAID: 'INSTALLMENT_SCHEDULE_ROW_PAID',
  INSTALLMENT_CONTRACT_NOT_ACTIVE: 'INSTALLMENT_CONTRACT_NOT_ACTIVE',

  // ── To'lovlar (§10) ───────────────────────────────────────────────────
  /** §10.2, §16.11 — ortiqcha to'lov qabul qilinmaydi. */
  PAYMENT_EXCEEDS_OUTSTANDING: 'PAYMENT_EXCEEDS_OUTSTANDING',
  PAYMENT_ACCOUNT_CURRENCY_MISMATCH: 'PAYMENT_ACCOUNT_CURRENCY_MISMATCH',
  PAYMENT_NOT_PENDING: 'PAYMENT_NOT_PENDING',
  PAYMENT_ALREADY_REVERSED: 'PAYMENT_ALREADY_REVERSED',
  PAYMENT_DATE_OUT_OF_RANGE: 'PAYMENT_DATE_OUT_OF_RANGE',

  // ── Kassa (§11) ───────────────────────────────────────────────────────
  /** §11.7 — avtomatik yozuv qo'lda tahrirlanmaydi. */
  CASH_ENTRY_NOT_MANUAL: 'CASH_ENTRY_NOT_MANUAL',
  /** §11.8 — faqat o'sha kuni ichida. */
  CASH_ENTRY_NOT_TODAY: 'CASH_ENTRY_NOT_TODAY',
  CASH_ACCOUNT_CURRENCY_MISMATCH: 'CASH_ACCOUNT_CURRENCY_MISMATCH',
  CASH_EXCHANGE_SAME_CURRENCY: 'CASH_EXCHANGE_SAME_CURRENCY',
  CASH_OPENING_BALANCE_EXISTS: 'CASH_OPENING_BALANCE_EXISTS',

  // ── Ombor (§5) ────────────────────────────────────────────────────────
  INVENTORY_DUPLICATE_IMEI: 'INVENTORY_DUPLICATE_IMEI',
  INVENTORY_ITEM_NOT_AVAILABLE: 'INVENTORY_ITEM_NOT_AVAILABLE',
  INVENTORY_COST_CURRENCY_MISMATCH: 'INVENTORY_COST_CURRENCY_MISMATCH',

  // ── Katalog va mijoz ──────────────────────────────────────────────────
  CATALOG_DUPLICATE_NAME: 'CATALOG_DUPLICATE_NAME',
  CUSTOMER_PHONE_TAKEN: 'CUSTOMER_PHONE_TAKEN',

  // ── Kurs (§3) ─────────────────────────────────────────────────────────
  EXCHANGE_RATE_MISSING: 'EXCHANGE_RATE_MISSING',
  /**
   * §16.8 — CBU kursiga qaytarib bo'lmaydi, chunki o'sha kun uchun CBU
   * qiymati olinmagan. `EXCHANGE_RATE_MISSING` dan farqli: kurs qatori
   * bor, faqat qaytariladigan asos yo'q.
   */
  EXCHANGE_RATE_CBU_MISSING: 'EXCHANGE_RATE_CBU_MISSING',

  // ── Fayl (§15) ────────────────────────────────────────────────────────
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_TYPE_NOT_ALLOWED: 'FILE_TYPE_NOT_ALLOWED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Validatsiya xatosidagi bitta maydon (`API.md` §3.2). */
export interface ApiErrorIssue {
  field: string;
  code: string;
  message: string;
}

/** `API.md` §3 — barcha xatolar shu shaklda qaytadi. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode | string;
    message: string;
    field?: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}
