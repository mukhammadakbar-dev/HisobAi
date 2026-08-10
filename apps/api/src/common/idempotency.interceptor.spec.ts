import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, UserRole } from '@hisobai/contracts';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { firstValueFrom, of, throwError } from 'rxjs';

import { AppException } from './app.exception';
import { IDEMPOTENT_KEY } from './auth.decorators';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import type { PrismaService } from '../database/prisma.service';

/**
 * §17.6 — bu qatlam moliyaviy dublikatni to'sadi. Telefon internetida
 * so'rov yetib borib javob yo'qolishi oddiy hol; foydalanuvchi tugmani
 * qayta bosadi. Test aynan shu ssenariyni tekshiradi.
 */

interface StoredKey {
  key: string;
  requestHash: string;
  statusCode: number | null;
  responseBody: unknown;
}

function makeInterceptor(store: Map<string, StoredKey>): IdempotencyInterceptor {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: unknown) =>
    key === IDEMPOTENT_KEY ? true : undefined,
  );

  const prisma = {
    idempotencyKey: {
      create: ({ data }: { data: StoredKey }) => {
        if (store.has(data.key)) {
          return Promise.reject(
            new Prisma.PrismaClientKnownRequestError('duplicate', {
              code: 'P2002',
              clientVersion: '7',
            }),
          );
        }
        store.set(data.key, { ...data, statusCode: null, responseBody: null });
        return Promise.resolve(data);
      },
      findUnique: ({ where }: { where: { key: string } }) =>
        Promise.resolve(store.get(where.key) ?? null),
      update: ({ where, data }: { where: { key: string }; data: Partial<StoredKey> }) => {
        const existing = store.get(where.key);
        if (existing) store.set(where.key, { ...existing, ...data });
        return Promise.resolve(existing);
      },
      delete: ({ where }: { where: { key: string } }) => {
        const existing = store.get(where.key);
        store.delete(where.key);
        return Promise.resolve(existing);
      },
    },
  } as unknown as PrismaService;

  return new IdempotencyInterceptor(reflector, prisma);
}

function makeContext(key: string | undefined, body: unknown): ExecutionContext {
  const request = {
    headers: key === undefined ? {} : { 'idempotency-key': key },
    method: 'POST',
    path: '/api/v1/payments',
    route: { path: '/api/v1/payments' },
    body,
    user: { id: 'user-1', role: UserRole.OWNER },
  };
  const response = {
    statusCode: 201,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
  };
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('IdempotencyInterceptor', () => {
  let store: Map<string, StoredKey>;

  beforeEach(() => {
    store = new Map();
  });

  it("kalitsiz so'rov rad etiladi", () => {
    const interceptor = makeInterceptor(store);
    const handler = { handle: () => of({ id: 'payment-1' }) } as CallHandler;

    try {
      interceptor.intercept(makeContext(undefined, { amount: '100' }), handler);
      expect.unreachable('kalit talab qilinishi kerak edi');
    } catch (error) {
      expect((error as AppException).code).toBe(ErrorCode.IDEMPOTENCY_KEY_REQUIRED);
    }
  });

  it("birinchi so'rov bajariladi va javob saqlanadi", async () => {
    const interceptor = makeInterceptor(store);
    let calls = 0;
    const handler = {
      handle: () => {
        calls += 1;
        return of({ id: 'payment-1' });
      },
    } as CallHandler;

    const result = await firstValueFrom(
      interceptor.intercept(makeContext('key-1', { amount: '100' }), handler),
    );

    expect(result).toEqual({ id: 'payment-1' });
    expect(calls).toBe(1);
    expect(store.get('key-1')?.statusCode).toBe(201);
  });

  it("TAKRORIY so'rov amalni QAYTA BAJARMAYDI — ikkinchi to'lov yaratilmaydi", async () => {
    const interceptor = makeInterceptor(store);
    let calls = 0;
    const handler = {
      handle: () => {
        calls += 1;
        return of({ id: 'payment-1' });
      },
    } as CallHandler;

    const body = { amount: '100', method: 'CASH' };
    await firstValueFrom(interceptor.intercept(makeContext('key-1', body), handler));
    const second = await firstValueFrom(interceptor.intercept(makeContext('key-1', body), handler));

    expect(calls).toBe(1); // ← eng muhim tekshiruv
    expect(second).toEqual({ id: 'payment-1' });
  });

  it("kalitlar tartibi boshqacha bo'lsa ham bir xil so'rov deb qaraladi", async () => {
    const interceptor = makeInterceptor(store);
    let calls = 0;
    const handler = {
      handle: () => {
        calls += 1;
        return of({ id: 'payment-1' });
      },
    } as CallHandler;

    await firstValueFrom(interceptor.intercept(makeContext('key-1', { a: 1, b: 2 }), handler));
    await firstValueFrom(interceptor.intercept(makeContext('key-1', { b: 2, a: 1 }), handler));

    expect(calls).toBe(1);
  });

  it('bir xil kalit, BOSHQA mazmun → 409', async () => {
    const interceptor = makeInterceptor(store);
    const handler = { handle: () => of({ id: 'payment-1' }) } as CallHandler;

    await firstValueFrom(interceptor.intercept(makeContext('key-1', { amount: '100' }), handler));

    // Eski javobni qaytarsak, foydalanuvchi 500 000 to'ladim deb o'ylaydi
    await expect(
      firstValueFrom(interceptor.intercept(makeContext('key-1', { amount: '500000' }), handler)),
    ).rejects.toMatchObject({ code: ErrorCode.IDEMPOTENCY_KEY_REUSED });
  });

  it("avvalgi so'rov hali bajarilmoqda → 409", async () => {
    const interceptor = makeInterceptor(store);
    const handler = { handle: () => of({ id: 'x' }) } as CallHandler;

    // Birinchi so'rov kalitni band qildi, lekin javob hali yozilmagan
    store.set('key-1', {
      key: 'key-1',
      requestHash: '',
      statusCode: null,
      responseBody: null,
    });

    await expect(
      firstValueFrom(interceptor.intercept(makeContext('key-1', {}), handler)),
    ).rejects.toBeInstanceOf(AppException);
  });

  /**
   * Amal bajarilmagan bo'lsa kalit bo'shatilishi SHART.
   *
   * Aks holda foydalanuvchi qamalib qoladi: bir xil body bilan
   * `REQUEST_IN_PROGRESS`, tuzatilgan body bilan `IDEMPOTENCY_KEY_REUSED`
   * — ya'ni xatoni tuzatib qayta yuborishning iloji yo'q, 24 soat
   * davomida. Qabul formasidagi dublikat IMEI aynan shu holat.
   */
  describe('handler xato tashlaganda', () => {
    const failing = {
      handle: () =>
        throwError(() => AppException.conflict(ErrorCode.INVENTORY_DUPLICATE_IMEI, 'dublikat')),
    } as CallHandler;

    it('kalit bo‘shatiladi — qator qolib ketmaydi', async () => {
      const interceptor = makeInterceptor(store);

      await expect(
        firstValueFrom(interceptor.intercept(makeContext('key-1', { imei: '1' }), failing)),
      ).rejects.toMatchObject({ code: ErrorCode.INVENTORY_DUPLICATE_IMEI });

      expect(store.has('key-1')).toBe(false);
    });

    it('xato tuzatilgach O‘SHA kalit bilan qayta yuborish ishlaydi', async () => {
      const interceptor = makeInterceptor(store);
      const ok = { handle: () => of({ id: 'item-1' }) } as CallHandler;

      await expect(
        firstValueFrom(interceptor.intercept(makeContext('key-1', { imei: '1' }), failing)),
      ).rejects.toBeInstanceOf(AppException);

      // Ega dublikatni olib tashladi va qayta yubordi — o'tishi kerak
      const result = await firstValueFrom(
        interceptor.intercept(makeContext('key-1', { imei: '2' }), ok),
      );

      expect(result).toEqual({ id: 'item-1' });
      expect(store.get('key-1')?.statusCode).toBe(201);
    });

    it('bir xil body bilan qayta urinish ham to‘silmaydi', async () => {
      const interceptor = makeInterceptor(store);
      const ok = { handle: () => of({ id: 'item-1' }) } as CallHandler;

      await expect(
        firstValueFrom(interceptor.intercept(makeContext('key-1', { imei: '1' }), failing)),
      ).rejects.toBeInstanceOf(AppException);

      await expect(
        firstValueFrom(interceptor.intercept(makeContext('key-1', { imei: '1' }), ok)),
      ).resolves.toEqual({ id: 'item-1' });
    });
  });

  it('muvaffaqiyatli javob JAVOB YUBORILISHIDAN OLDIN saqlanadi', async () => {
    const interceptor = makeInterceptor(store);
    const handler = { handle: () => of({ id: 'payment-1' }) } as CallHandler;

    await firstValueFrom(interceptor.intercept(makeContext('key-1', { amount: '100' }), handler));

    // Saqlash `await` qilinmasa, takroriy so'rov bu yerda hali `null`
    // ko'rib `REQUEST_IN_PROGRESS` olardi
    expect(store.get('key-1')?.statusCode).toBe(201);
    expect(store.get('key-1')?.responseBody).toEqual({ id: 'payment-1' });
  });
});
