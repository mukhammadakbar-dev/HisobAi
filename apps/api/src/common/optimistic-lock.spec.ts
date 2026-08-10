import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@hisobai/contracts';
import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import { AppException } from './app.exception';
import { assertFresh, readPrecondition } from './optimistic-lock';

/**
 * Optimistik qulf sinovdan o'tkaziladi, chunki uning buzilishi **jim**
 * bo'ladi: noto'g'ri solishtiruv konfliktni o'tkazib yuboradi va
 * foydalanuvchi o'z o'zgarishi yo'qolganini hech qachon bilmaydi.
 */

function requestWith(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

const UPDATED_AT = '2026-08-10T09:30:00.123Z';

describe('readPrecondition', () => {
  it('body tokenini oladi va aniq solishtiruv uchun filtr beradi', () => {
    const precondition = readPrecondition(requestWith(), UPDATED_AT);

    expect(precondition.source).toBe('body');
    expect(precondition.expected.toISOString()).toBe(UPDATED_AT);
    expect(precondition.updatedAt).toEqual(new Date(UPDATED_AT));
  });

  it("sarlavhani oladi va sekund aniqligi uchun ms bardoshi qo'shadi", () => {
    const precondition = readPrecondition(
      requestWith({ 'if-unmodified-since': '2026-08-10T09:30:00Z' }),
      undefined,
    );

    expect(precondition.source).toBe('header');
    expect(precondition.updatedAt).toEqual({ lte: new Date('2026-08-10T09:30:00.999Z') });
  });

  it('ikkalasi kelsa body ustun turadi — u millisekundgacha aniq', () => {
    const precondition = readPrecondition(
      requestWith({ 'if-unmodified-since': '2020-01-01T00:00:00Z' }),
      UPDATED_AT,
    );

    expect(precondition.source).toBe('body');
    expect(precondition.expected.toISOString()).toBe(UPDATED_AT);
  });

  it("token umuman bo'lmasa 428 — qulfsiz yozishga yo'l qo'yilmaydi", () => {
    try {
      readPrecondition(requestWith(), undefined);
      expect.unreachable('xato kutilgan edi');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      const exception = error as AppException;
      expect(exception.code).toBe(ErrorCode.PRECONDITION_REQUIRED);
      expect(exception.getStatus()).toBe(HttpStatus.PRECONDITION_REQUIRED);
    }
  });

  it("bo'sh sarlavha yo'q sarlavha bilan bir xil — 428", () => {
    expect(() =>
      readPrecondition(requestWith({ 'if-unmodified-since': '   ' }), undefined),
    ).toThrow(AppException);
  });

  it("o'qib bo'lmaydigan vaqt 400 beradi, jimgina o'tib ketmaydi", () => {
    try {
      readPrecondition(requestWith({ 'if-unmodified-since': 'kecha' }), undefined);
      expect.unreachable('xato kutilgan edi');
    } catch (error) {
      const exception = error as AppException;
      expect(exception.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
  });
});

describe('assertFresh', () => {
  it("body tokeni bir xil bo'lsa o'tkazadi", () => {
    const precondition = readPrecondition(requestWith(), UPDATED_AT);
    expect(() => assertFresh(new Date(UPDATED_AT), precondition)).not.toThrow();
  });

  it('bitta millisekund farq ham konflikt — pul yozuvida yaxlitlash yo‘q', () => {
    const precondition = readPrecondition(requestWith(), UPDATED_AT);
    const current = new Date(new Date(UPDATED_AT).getTime() + 1);

    try {
      assertFresh(current, precondition);
      expect.unreachable('xato kutilgan edi');
    } catch (error) {
      const exception = error as AppException;
      expect(exception.code).toBe(ErrorCode.STALE_RESOURCE);
      expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);
      // Tafsilotlar ikkala vaqtni ham beradi — nosozlikni tekshirish uchun
      expect(exception.details).toEqual({
        expectedUpdatedAt: UPDATED_AT,
        actualUpdatedAt: current.toISOString(),
      });
    }
  });

  it("sarlavha varianti ms qismini kechiradi — aks holda u hech qachon o'tmasdi", () => {
    const precondition = readPrecondition(
      requestWith({ 'if-unmodified-since': '2026-08-10T09:30:00Z' }),
      undefined,
    );

    expect(() => assertFresh(new Date('2026-08-10T09:30:00.123Z'), precondition)).not.toThrow();
  });

  it('sarlavhadan keyin yozilgan o‘zgarish konflikt beradi', () => {
    const precondition = readPrecondition(
      requestWith({ 'if-unmodified-since': '2026-08-10T09:30:00Z' }),
      undefined,
    );

    expect(() => assertFresh(new Date('2026-08-10T09:30:01.000Z'), precondition)).toThrow(
      AppException,
    );
  });
});
