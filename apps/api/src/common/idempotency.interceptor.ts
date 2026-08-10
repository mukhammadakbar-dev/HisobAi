import { createHash } from 'node:crypto';

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@hisobai/contracts';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import type { Observable } from 'rxjs';
import { from, of, switchMap, tap } from 'rxjs';

import { AppException } from './app.exception';
import { IDEMPOTENT_KEY } from './auth.decorators';
import { serializeDecimals } from './decimal-serializer.interceptor';
import type { AuthedRequest } from './request-user';
import { PrismaService } from '../database/prisma.service';

/** Saqlangan javob shu muddatdan keyin tozalanadi (`API.md` §4.2). */
export const IDEMPOTENCY_TTL_HOURS = 24;

/**
 * Takroriy so'rovni to'sadi (§17.6, `API.md` §4).
 *
 * Muammo: telefon internetida so'rov serverga yetib boradi, javob esa
 * yo'qoladi. Foydalanuvchi tugmani qayta bosadi — natijada **ikki savdo**
 * yoki **ikki to'lov**. UI'da tugmani bloklash yetarli emas, chunki
 * birinchi so'rov allaqachon bajarilgan bo'lishi mumkin.
 *
 * Yechim: client forma ochilganda bitta kalit yaratadi va qayta
 * yuborishda o'zgartirmaydi. Server o'sha kalit bo'yicha javobni saqlaydi
 * va takroriy so'rovda amalni **qayta bajarmasdan** eski javobni qaytaradi.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const required = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required !== true) return next.handle();

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const response = context.switchToHttp().getResponse<Response>();

    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.trim().length === 0) {
      throw AppException.badRequest(
        ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        "So'rov takrorlanmasligi uchun kalit yuborilishi shart.",
      );
    }

    const user = request.user;
    if (!user) {
      throw AppException.unauthorized(ErrorCode.AUTH_REQUIRED, 'Tizimga kiring.');
    }

    const endpoint = `${request.method} ${request.route?.path ?? request.path}`;
    const requestHash = hashBody(request.body);

    return from(this.claim(key, user.id, endpoint, requestHash)).pipe(
      switchMap((existing) => {
        if (existing) {
          response.status(existing.statusCode ?? 200);
          return of(existing.body);
        }

        return next.handle().pipe(
          tap((body: unknown) => {
            void this.store(key, response.statusCode, body);
          }),
        );
      }),
    );
  }

  /**
   * Kalitni band qiladi. Poyga `key` ustidagi primary key bilan hal
   * qilinadi — ikki parallel so'rovdan faqat bittasi `INSERT` qila oladi.
   *
   * Qaytaradi: `null` — amalni bajarish kerak; obyekt — tayyor javob bor.
   */
  private async claim(
    key: string,
    userId: string,
    endpoint: string,
    requestHash: string,
  ): Promise<{ statusCode: number | null; body: unknown } | null> {
    try {
      await this.prisma.idempotencyKey.create({
        data: { key, userId, endpoint, requestHash },
      });
      return null;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
    }

    const existing = await this.prisma.idempotencyKey.findUnique({ where: { key } });
    if (!existing) {
      // Kalit yaratilib, keyin tozalanib ketgan — qayta urinish xavfsiz emas
      throw AppException.conflict(
        ErrorCode.REQUEST_IN_PROGRESS,
        "So'rov holati aniqlanmadi. Sahifani yangilab, qaytadan tekshiring.",
      );
    }

    // Bir xil kalit, boshqa mazmun — bu client xatosi, jimgina o'tkazib
    // bo'lmaydi: eski javobni qaytarsak foydalanuvchi boshqa amal
    // bajarildi deb o'ylaydi.
    if (existing.requestHash !== requestHash) {
      throw AppException.conflict(
        ErrorCode.IDEMPOTENCY_KEY_REUSED,
        "Bu kalit boshqa so'rov uchun ishlatilgan. Sahifani yangilang.",
      );
    }

    if (existing.statusCode === null) {
      throw AppException.conflict(
        ErrorCode.REQUEST_IN_PROGRESS,
        "Avvalgi so'rov hali bajarilmoqda. Biroz kutib, qaytadan urinib ko'ring.",
      );
    }

    return { statusCode: existing.statusCode, body: existing.responseBody };
  }

  private async store(key: string, statusCode: number, body: unknown): Promise<void> {
    await this.prisma.idempotencyKey.update({
      where: { key },
      data: {
        statusCode,
        // `Decimal` JSONB ga xom holda tushmasin — qaytarilganda ham
        // birinchi javob bilan bir xil shakl bo'lishi kerak.
        responseBody: serializeDecimals(body) as Prisma.InputJsonValue,
      },
    });
  }
}

function hashBody(body: unknown): string {
  const normalized = body === undefined ? '' : JSON.stringify(sortKeys(body));
  return createHash('sha256').update(normalized).digest('hex');
}

/** Kalitlar tartibi so'rovdan so'rovga farq qilmasin. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      result[key] = sortKeys(source[key]);
    }
    return result;
  }
  return value;
}
