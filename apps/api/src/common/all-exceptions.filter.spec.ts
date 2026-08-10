import {
  ArgumentsHost,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ErrorCode } from '@hisobai/contracts';
import type { ApiErrorBody } from '@hisobai/contracts';
import { ThrottlerException } from '@nestjs/throttler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppException } from './app.exception';

interface Captured {
  status: number;
  body: ApiErrorBody;
  headers: Record<string, string | number>;
}

function makeHost(captured: Captured): ArgumentsHost {
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: ApiErrorBody) {
      captured.body = body;
      return this;
    },
    setHeader(name: string, value: string | number) {
      captured.headers[name] = value;
      return this;
    },
    // Node `getHeaders()` nomlarni doim kichik harfda qaytaradi —
    // filter aynan shunga tayanadi, shuning uchun dublyor ham shunday
    getHeaders() {
      return Object.fromEntries(
        Object.entries(captured.headers).map(([name, value]) => [name.toLowerCase(), value]),
      );
    },
  };

  const request = { method: 'POST', url: '/api/v1/sales', id: 'req-123' };

  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();
  let captured: Captured;

  beforeEach(() => {
    captured = { status: 0, body: {} as ApiErrorBody, headers: {} };
    // 5xx da stack loglanadi — test chiqishini iflos qilmasin
    vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
    vi.spyOn(filter['logger'], 'debug').mockImplementation(() => undefined);
  });

  it('AppException barcha maydonlarini saqlaydi', () => {
    const exception = AppException.conflict(
      ErrorCode.SALE_ITEM_NOT_AVAILABLE,
      'Bu IMEI allaqachon sotilgan',
      { inventoryItemId: 'abc', soldInSaleNumber: '2026-00147' },
    );

    filter.catch(exception, makeHost(captured));

    expect(captured.status).toBe(HttpStatus.CONFLICT);
    expect(captured.body.error).toEqual({
      code: ErrorCode.SALE_ITEM_NOT_AVAILABLE,
      message: 'Bu IMEI allaqachon sotilgan',
      details: { inventoryItemId: 'abc', soldInSaleNumber: '2026-00147' },
      requestId: 'req-123',
    });
  });

  it('422 — biznes qoidasi, field bilan', () => {
    filter.catch(
      AppException.rule(
        ErrorCode.PAYMENT_EXCEEDS_OUTSTANDING,
        'Qarzdan ortiq summa kiritildi',
        'paidAmount',
      ),
      makeHost(captured),
    );

    expect(captured.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(captured.body.error.field).toBe('paidAmount');
  });

  it('Nest HttpException ni ham bir xil shaklga keltiradi', () => {
    filter.catch(new NotFoundException(), makeHost(captured));

    expect(captured.status).toBe(HttpStatus.NOT_FOUND);
    expect(captured.body.error.code).toBe(ErrorCode.NOT_FOUND);
    expect(captured.body.error.message).toBe('Topilmadi.');
    expect(captured.body.error.requestId).toBe('req-123');
  });

  it('kutilmagan xatoda ichki tafsilot oshkor qilinmaydi', () => {
    filter.catch(new Error('connect ECONNREFUSED 10.0.0.5:5432'), makeHost(captured));

    expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(captured.body.error.message).toBe("Server javob bermadi. Qayta urinib ko'ring.");
    expect(JSON.stringify(captured.body)).not.toContain('ECONNREFUSED');
  });

  it("har javobda requestId bo'ladi", () => {
    filter.catch(new Error('x'), makeHost(captured));
    expect(captured.body.error.requestId).toBe('req-123');
  });

  /**
   * `API.md` §9 — `Retry-After` `429` va `503` da. Usiz client "biroz
   * kutib turing" degan matnni ko'radi, lekin qancha kutishni bilmaydi
   * va odatda darhol qayta uradi.
   */
  describe('Retry-After (§9)', () => {
    it('xato aytgan qiymatni sarlavhaga ham, body ga ham qo‘yadi', () => {
      filter.catch(
        AppException.tooManyRequests(ErrorCode.AUTH_BLOCKED, 'Kirish bloklandi', 754),
        makeHost(captured),
      );

      expect(captured.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(captured.headers['Retry-After']).toBe('754');
      expect(captured.body.error.details).toMatchObject({ retryAfterSeconds: 754 });
    });

    /**
     * Throttler nomlangan profil uchun `Retry-After-mutation` yozadi —
     * standart nomni hech kim qo'ymaydi. Shuning uchun filter uni
     * tiklaydi; eng uzoq kutish tanlanadi.
     */
    it('throttler qo‘ygan nomlangan sarlavhadan standart nomni tiklaydi', () => {
      captured.headers['Retry-After-read'] = 12;
      captured.headers['Retry-After-mutation'] = 45;

      filter.catch(new ThrottlerException(), makeHost(captured));

      expect(captured.status).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(captured.headers['Retry-After']).toBe('45');
      expect(captured.body.error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(captured.body.error.details).toMatchObject({ retryAfterSeconds: 45 });
    });

    it('manba topilmasa throttler oynasini aytadi — sarlavhasiz qoldirmaydi', () => {
      filter.catch(new ThrottlerException(), makeHost(captured));
      expect(captured.headers['Retry-After']).toBe('60');
    });

    it('503 da ham qo‘yiladi — DB qaytguncha monitoring kutsin', () => {
      filter.catch(new ServiceUnavailableException(), makeHost(captured));

      expect(captured.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(captured.headers['Retry-After']).toBe('15');
    });

    it('boshqa xatolarda sarlavha qo‘yilmaydi', () => {
      filter.catch(new NotFoundException(), makeHost(captured));
      expect(captured.headers['Retry-After']).toBeUndefined();
    });
  });
});
