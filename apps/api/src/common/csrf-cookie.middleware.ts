import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

import type { Env } from '../config/env';
import { CSRF_COOKIE_NAME } from './csrf.guard';
import { createCsrfToken, csrfCookieOptions } from './session-token';

/** Cookie sessiya bilan bir muddat yashaydi — qayta login talab qilinmasin. */
const CSRF_TTL_DAYS = 30;

/**
 * CSRF cookie'sini birinchi so'rovda o'rnatadi (`API.md` §1).
 *
 * `CsrfGuard` double-submit tekshiruvini bajaradi, lekin cookie'ni
 * kimdir **qo'yishi** kerak. Uni login javobida qo'yish yetarli emas:
 * `POST /auth/login` ning o'zi ham himoyalangan (login-CSRF haqiqiy
 * hujum turi), ya'ni cookie login'dan **oldin** kerak.
 *
 * Shuning uchun: cookie yo'q bo'lsa, istalgan so'rovda yaratiladi.
 * Web ilova sahifa ochilganda `GET /auth/me` chaqiradi — cookie o'sha
 * javobda keladi va keyingi `POST` sarlavha bilan yuboriladi.
 *
 * Mavjud cookie **ustidan yozilmaydi**: aks holda ikki parallel so'rov
 * bir-birining tokenini almashtirib, foydalanuvchi 403 olardi.
 */
@Injectable()
export class CsrfCookieMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService<Env, true>) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const existing = (req as Request & { cookies?: Record<string, string> }).cookies?.[
      CSRF_COOKIE_NAME
    ];

    if (typeof existing !== 'string' || existing.length === 0) {
      const isProduction = this.config.get('NODE_ENV', { infer: true }) === 'production';
      res.cookie(
        CSRF_COOKIE_NAME,
        createCsrfToken(),
        csrfCookieOptions(isProduction, CSRF_TTL_DAYS * 24 * 60 * 60 * 1000),
      );
    }

    next();
  }
}
