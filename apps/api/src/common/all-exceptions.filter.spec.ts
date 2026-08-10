import { ArgumentsHost, HttpStatus, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '@hisobai/contracts';
import type { ApiErrorBody } from '@hisobai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppException } from './app.exception';

interface Captured {
  status: number;
  body: ApiErrorBody;
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
    captured = { status: 0, body: {} as ApiErrorBody };
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
});
