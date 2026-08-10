import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ErrorCode } from '@hisobai/contracts';
import type { ApiErrorBody } from '@hisobai/contracts';
import type { Request, Response } from 'express';

import { AppException } from './app.exception';

/**
 * `API.md` §6 — throttler oynasi 60 sekund. Aniq qiymat topilmasa
 * shu ishlatiladi: `Retry-After` ni umuman qo'ymaslikdan ko'ra,
 * kafolatlangan yuqori chegarani aytish yaxshiroq.
 */
const THROTTLE_WINDOW_SECONDS = 60;

/**
 * `503` — DB vaqtincha yo'q (`/health/ready`). Qiymat qisqa: uzilish
 * odatda soniyalar ichida tugaydi, monitoring esa tez qaytib kelsin.
 */
const UNAVAILABLE_RETRY_SECONDS = 15;

/**
 * Nomlangan throttler qo'yadigan sarlavha prefiksi.
 *
 * `@nestjs/throttler` nom berilgan profil uchun `Retry-After` emas,
 * `Retry-After-<nom>` yozadi (`read`, `mutation`). Standart nomni hech
 * kim qo'ymaydi — client va proxy uchun uni shu filter tiklaydi.
 */
const THROTTLER_HEADER_PREFIX = 'retry-after-';

/**
 * Barcha xatolarni `API.md` §3 dagi yagona shaklga keltiradi.
 *
 * Nega kerak: har modul o'z xato shaklini qaytarsa, frontend har joyda
 * boshqacha ishlov berishga majbur bo'ladi. Bu filter kod yozilishidan
 * OLDIN qo'yiladi — keyin qo'shilsa, 40+ endpointni qayta ko'rib chiqish
 * kerak bo'lardi.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as Request & { id?: string }).id ?? '—';

    const { status, body } = this.toErrorBody(exception, requestId);
    this.applyRetryAfter(response, status, body);

    // 5xx — kutilmagan xato, to'liq stack bilan yoziladi.
    // 4xx — kutilgan holat, shovqin qilmasin.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} → ${String(status)} [${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.debug(
        `${request.method} ${request.url} → ${String(status)} ${body.error.code} [${requestId}]`,
      );
    }

    response.status(status).json(body);
  }

  /**
   * `Retry-After` (`API.md` §9) — `429` va `503` da.
   *
   * Sarlavha **va** `details.retryAfterSeconds` birga qo'yiladi: sarlavha
   * standart (proxy va monitoring o'qiydi), body esa UI uchun — brauzerda
   * sarlavhani o'qish CORS `exposedHeaders` ga bog'liq va u yerdan
   * tushib qolsa xato jimgina yo'qolardi.
   */
  private applyRetryAfter(response: Response, status: number, body: ApiErrorBody): void {
    if (status !== HttpStatus.TOO_MANY_REQUESTS && status !== HttpStatus.SERVICE_UNAVAILABLE) {
      return;
    }

    const seconds = this.retryAfterSeconds(response, status, body);
    response.setHeader('Retry-After', String(seconds));
    body.error.details = { ...body.error.details, retryAfterSeconds: seconds };
  }

  private retryAfterSeconds(response: Response, status: number, body: ApiErrorBody): number {
    // 1. Xatoning o'zi aytgan qiymat — eng aniq (masalan §2.9 login bloki)
    const declared = body.error.details?.retryAfterSeconds;
    if (typeof declared === 'number' && Number.isFinite(declared) && declared > 0) {
      return Math.ceil(declared);
    }

    // 2. Throttler qo'ygan `Retry-After-<nom>`; bir nechtasi bo'lsa
    //    eng uzog'i olinadi — qisqasi darhol yana `429` ga olib keladi
    const fromThrottler = Object.entries(response.getHeaders())
      .filter(([name]) => name.startsWith(THROTTLER_HEADER_PREFIX))
      .map(([, value]) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (fromThrottler.length > 0) return Math.ceil(Math.max(...fromThrottler));

    return status === HttpStatus.TOO_MANY_REQUESTS
      ? THROTTLE_WINDOW_SECONDS
      : UNAVAILABLE_RETRY_SECONDS;
  }

  private toErrorBody(
    exception: unknown,
    requestId: string,
  ): { status: number; body: ApiErrorBody } {
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        body: {
          error: {
            code: exception.code,
            message: exception.userMessage,
            ...(exception.field ? { field: exception.field } : {}),
            ...(exception.details ? { details: exception.details } : {}),
            requestId,
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        body: {
          error: {
            code: this.codeForStatus(status),
            message: this.messageForStatus(status),
            requestId,
          },
        },
      };
    }

    // Kutilmagan xato — ichki tafsilot foydalanuvchiga chiqmaydi.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: "Server javob bermadi. Qayta urinib ko'ring.",
          requestId,
        },
      },
    };
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.AUTH_REQUIRED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_FAILED;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }

  private messageForStatus(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return 'Tizimga kiring.';
      case HttpStatus.FORBIDDEN:
        return "Bu amalga ruxsatingiz yo'q.";
      case HttpStatus.NOT_FOUND:
        return 'Topilmadi.';
      case HttpStatus.TOO_MANY_REQUESTS:
        return "Juda ko'p urinish. Biroz kutib turing.";
      case HttpStatus.BAD_REQUEST:
        return "So'rov noto'g'ri.";
      default:
        return "Server javob bermadi. Qayta urinib ko'ring.";
    }
  }
}
