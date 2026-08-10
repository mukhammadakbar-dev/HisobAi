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
