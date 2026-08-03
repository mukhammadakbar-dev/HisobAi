import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isProduction = process.env.NODE_ENV === 'production';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Ichki server xatoligi yuz berdi';
    let errorResponse: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        message = (res as any).message || res;
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled Error on ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );

      if (!isProduction) {
        message = exception.message || 'Server error';
        errorResponse = exception.stack;
      }
    } else {
      this.logger.error(`Unknown exception on ${request.method} ${request.url}`, exception);
    }

    const payload: any = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: typeof message === 'string' ? message : (message as any).message || message,
    };

    if (!isProduction && errorResponse) {
      payload.stack = errorResponse;
    }

    response.status(status).json(payload);
  }
}
