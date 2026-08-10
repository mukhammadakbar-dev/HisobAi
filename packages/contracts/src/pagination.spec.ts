import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor } from './pagination';

/**
 * Kursor `btoa`/`atob`siz, sof TypeScript'da kodlanadi — paket ham Node'da
 * (api), ham brauzerda (web) ishlaydi.
 */
describe('kursor kodlash', () => {
  it("aylanma o'zgarishsiz qaytadi", () => {
    const payload = { value: '2026-08-10T09:00:00.000Z', id: 'a1b2c3d4' };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it('URL uchun xavfsiz belgilardan iborat', () => {
    const cursor = encodeCursor({ value: '2026-08-10', id: 'x'.repeat(36) });
    expect(cursor).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(encodeURIComponent(cursor)).toBe(cursor);
  });

  it("o'zbekcha va kirill harflarni ko'taradi", () => {
    const payload = { value: "Alisher Karimov — o'g'li", id: 'id-1' };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it("turli uzunlikdagi qiymatlar (base64 to'ldirish chegaralari)", () => {
    for (let length = 1; length <= 12; length += 1) {
      const payload = { value: 'v'.repeat(length), id: 'i' };
      expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
    }
  });

  it('buzuq kursor null qaytaradi, yiqilmaydi', () => {
    expect(decodeCursor('!!!')).toBeNull();
    expect(decodeCursor('')).toBeNull();
    expect(decodeCursor(encodeCursor({ value: 'a', id: 'b' }).slice(0, 3))).toBeNull();
  });

  it('shakli mos kelmasa null', () => {
    // {"foo":1} ning base64url shakli
    const wrong = encodeCursor({ value: 'a', id: 'b' }).replace(/./g, 'A');
    expect(decodeCursor(wrong)).toBeNull();
  });
});
