import { randomUUID } from 'node:crypto';

import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Har so'rovga identifikator beradi (`API.md` §3, §9).
 *
 * Xato javobidagi `requestId` bilan structured log'dagi yozuv shu orqali
 * bog'lanadi: foydalanuvchi ekrandagi raqamni aytsa, logdan aynan o'sha
 * so'rov topiladi.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();

    (req as Request & { id: string }).id = id;
    res.setHeader('X-Request-Id', id);
    next();
  }
}
