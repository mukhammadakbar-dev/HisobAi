import { createHash } from 'node:crypto';

import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@hisobai/contracts';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import type { Observable } from 'rxjs';
import { catchError, concatMap, from, of, switchMap, throwError } from 'rxjs';

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
  private readonly logger = new Logger(IdempotencyInterceptor.name);

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
          // `concatMap` — javob yuborilishidan OLDIN saqlanadi. Aks holda
          // takroriy so'rov saqlashdan tezroq kelib, `REQUEST_IN_PROGRESS`
          // olishi mumkin edi.
          concatMap(async (body: unknown) => {
            await this.store(key, response.statusCode, body);
            return body;
          }),
          /**
           * **Amal bajarilmadi — kalit bo'shatiladi.**
           *
           * Usiz qator `status_code = null` bo'lib qolib ketardi va o'sha
           * kalit 24 soat davomida o'lik bo'lardi: bir xil body bilan
           * `REQUEST_IN_PROGRESS`, tuzatilgan body bilan esa
           * `IDEMPOTENCY_KEY_REUSED`. Ya'ni xatoni tuzatib qayta
           * yuborishning iloji qolmasdi — 50 ta IMEI ichida 3 tasi
           * dublikat chiqqan qabul formasida aynan shu holat.
           *
           * Bo'shatish xavfsiz, chunki moliyaviy handler'lar bitta
           * tranzaksiyada ishlaydi: xato tashlangan bo'lsa, hech narsa
           * commit qilinmagan.
           */
          catchError((error: unknown) =>
            from(this.release(key)).pipe(concatMap(() => throwError(() => error))),
          ),
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

    // `findFirst` — `findUnique` EMAS, ataylab: unique kalit endi
    // `(shopId, key)` juftligi (§21.11), va `shopId`ni bu yerda qo'lda
    // yozib qo'yish §21.7 buzardi. `key` yagona shart bilan qidirish
    // xavfsiz: `IdempotencyKey` shop-scoped model, extension buni
    // avtomatik joriy Shop bilan cheklaydi (`prisma.service.ts`)  —
    // boshqa Shop'ning bir xil `key`li qatori bu yerga umuman kelmaydi.
    const existing = await this.prisma.idempotencyKey.findFirst({ where: { key } });
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
    //
    // `userId` mosligi §21.11 talabi: ikkalasi bir Shop ichida bo'lsa ham
    // (shop-scoped unique kalit shopId bo'yicha to'qnashuvni allaqachon
    // yo'qotgan), boshqa FOYDALANUVCHI mos `requestHash` bilan (masalan
    // bo'sh bodyli so'rovda hash doim bir xil) kalitni "taxmin qilib"
    // birinchi foydalanuvchining `response_body`sini — savdo tasdiqlash
    // yoki to'lov javobini — o'qib olishi mumkin edi.
    if (existing.requestHash !== requestHash || existing.userId !== userId) {
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

  /**
   * Javobni saqlaydi. Yozib bo'lmasa ham so'rov MUVAFFAQIYATLI qoladi:
   * amal allaqachon bajarilgan, uni xato deb ko'rsatish yolg'on bo'lardi.
   * Bunday holatda kalit `null` bo'lib qoladi va takroriy so'rov
   * `REQUEST_IN_PROGRESS` oladi — bu xavfsiz tomon: moliyaviy amalni
   * ikkinchi marta bajarishdan ko'ra to'sib qo'ygan yaxshi.
   */
  private async store(key: string, statusCode: number, body: unknown): Promise<void> {
    try {
      // `updateMany` — `key` yolg'iz o'ziga unique EMAS (§21.11), va
      // `update({ where: { shopId_key: … } })` shopId'ni qo'lda talab
      // qilardi. Shop-scoped filtr allaqachon extension orqali qo'yiladi.
      await this.prisma.idempotencyKey.updateMany({
        where: { key },
        data: {
          statusCode,
          // `Decimal` JSONB ga xom holda tushmasin — qaytarilganda ham
          // birinchi javob bilan bir xil shakl bo'lishi kerak.
          responseBody: serializeDecimals(body) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.error(`Idempotency javobi saqlanmadi (${key}): ${describe(error)}`);
    }
  }

  /**
   * Band qilingan kalitni bo'shatadi — amal bajarilmagani uchun.
   *
   * Bu yerda ham xato yutiladi: asosiy xato foydalanuvchiga yetib
   * borishi kerak, bo'shatolmaganimiz uni almashtirmasin.
   */
  private async release(key: string): Promise<void> {
    try {
      // `deleteMany` — xuddi `store()` dagi kabi, `key` yolg'iz unique emas.
      await this.prisma.idempotencyKey.deleteMany({ where: { key } });
    } catch (error) {
      this.logger.warn(`Idempotency kaliti bo'shatilmadi (${key}): ${describe(error)}`);
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
