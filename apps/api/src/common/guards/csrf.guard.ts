import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();

    // Safe HTTP methods do not require CSRF verification
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    const path = request.path || request.url;

    // Login and initial CSRF endpoints do not require CSRF token
    if (path.includes('/auth/login') || path.includes('/auth/csrf')) {
      return true;
    }

    const csrfCookie = request.cookies?.['baraka_csrf'];
    const csrfHeader =
      (request.headers['x-csrf-token'] as string) ||
      (request.headers['X-CSRF-Token'] as string);

    if (!csrfCookie || !csrfHeader) {
      throw new ForbiddenException('CSRF tokeni yaroqsiz yoki mavjud emas');
    }

    if (csrfCookie !== csrfHeader) {
      throw new ForbiddenException('CSRF token mos kelmadi');
    }

    return true;
  }
}
