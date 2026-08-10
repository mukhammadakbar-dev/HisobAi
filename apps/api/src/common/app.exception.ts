import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@hisobai/contracts';

/**
 * Biznes xatosi (`API.md` §3).
 *
 * Nest'ning standart `HttpException`'i o'rniga shu ishlatiladi: u `code`,
 * `field` va `details` ni majburiy shaklda olib yuradi. Frontend qarorni
 * `code` bo'yicha qabul qiladi — `message` faqat ko'rsatish uchun.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    readonly userMessage: string,
    status: HttpStatus,
    readonly field?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(userMessage, status);
  }

  /** 409 — holat mos emas. Vaqt o'tishi bilan o'zgarishi mumkin. */
  static conflict(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ): AppException {
    return new AppException(code, message, HttpStatus.CONFLICT, undefined, details);
  }

  /**
   * 422 — biznes qoidasi buzildi. Ma'lumot to'g'ri, lekin qoidaga zid;
   * o'zgartirmasdan qayta urinish foydasiz.
   */
  static rule(
    code: ErrorCode,
    message: string,
    field?: string,
    details?: Record<string, unknown>,
  ): AppException {
    return new AppException(code, message, HttpStatus.UNPROCESSABLE_ENTITY, field, details);
  }

  static notFound(code: ErrorCode, message: string): AppException {
    return new AppException(code, message, HttpStatus.NOT_FOUND);
  }

  static forbidden(code: ErrorCode, message: string): AppException {
    return new AppException(code, message, HttpStatus.FORBIDDEN);
  }

  static unauthorized(code: ErrorCode, message: string): AppException {
    return new AppException(code, message, HttpStatus.UNAUTHORIZED);
  }

  static badRequest(code: ErrorCode, message: string, field?: string): AppException {
    return new AppException(code, message, HttpStatus.BAD_REQUEST, field);
  }

  /**
   * 429 — limit oshdi (`API.md` §6). `details.retryAfterSeconds` bilan
   * yuboriladi: UI foydalanuvchiga qancha kutishni aniq aytsin, "keyinroq
   * urinib ko'ring" degan foydasiz matn o'rniga.
   */
  static tooManyRequests(
    code: ErrorCode,
    message: string,
    retryAfterSeconds: number,
  ): AppException {
    return new AppException(code, message, HttpStatus.TOO_MANY_REQUESTS, undefined, {
      retryAfterSeconds,
    });
  }
}
