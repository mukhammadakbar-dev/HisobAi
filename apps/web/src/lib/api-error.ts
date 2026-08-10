import { ErrorCode } from '@hisobai/contracts';
import type { ApiErrorIssue } from '@hisobai/contracts';

/**
 * Serverdan kelgan xato (`API.md` §3).
 *
 * Frontend qarorni **faqat `code`** bo'yicha qabul qiladi. `message` ni
 * shartga solish taqiqlanadi: u istalgan vaqtda tahrirlanishi mumkin va
 * bunday shart jimgina ishlamay qoladi.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly field?: string;
  readonly details?: Record<string, unknown>;
  readonly requestId?: string;

  constructor(init: {
    code: string;
    message: string;
    status: number;
    field?: string;
    details?: Record<string, unknown>;
    requestId?: string;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.field = init.field;
    this.details = init.details;
    this.requestId = init.requestId;
  }

  /** Tarmoq umuman javob bermadi — server xatosi emas. */
  static network(): ApiError {
    return new ApiError({
      code: ErrorCode.NETWORK_ERROR,
      message: "Internet yo'q yoki server javob bermadi.",
      status: 0,
    });
  }

  /** Validatsiya xatosidagi maydonlar ro'yxati (`API.md` §3.2). */
  get issues(): ApiErrorIssue[] {
    const raw = this.details?.issues;
    return Array.isArray(raw) ? (raw as ApiErrorIssue[]) : [];
  }

  /** Qayta urinish ma'noli holat — tarmoq yoki server vaqtinchalik yiqilgan. */
  get isRetriable(): boolean {
    return this.status === 0 || this.status >= 500 || this.status === 429;
  }

  /**
   * `429` va `503` da — necha sekund kutish kerakligi (`API.md` §9).
   *
   * Qiymat `Retry-After` sarlavhasidan emas, javob tanasidan olinadi:
   * sarlavhani brauzer faqat CORS `exposedHeaders` ga tushgan holda
   * ko'radi, tana esa har doim yetib keladi.
   */
  get retryAfterSeconds(): number | undefined {
    const value = this.details?.retryAfterSeconds;
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
  }
}
