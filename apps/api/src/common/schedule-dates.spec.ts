import { describe, expect, it } from 'vitest';

import { hourInTimeZone, nextOccurrenceOfHour, timeZoneOffsetMs } from './dates';

/**
 * Vaqt zonasi hisobi qo'lda yozilgan (tayyor cron kutubxonasi o'rniga),
 * shuning uchun u sinaladi. Xato bo'lsa CBU sync noto'g'ri soatda
 * ishlaydi va buni hech kim sezmaydi — kurs shunchaki "kechroq" keladi.
 */

const TASHKENT = 'Asia/Tashkent';

describe('timeZoneOffsetMs', () => {
  it("Toshkent UTC+5 — yil davomida o'zgarmaydi (yozgi vaqt yo'q)", () => {
    const fiveHours = 5 * 60 * 60 * 1000;
    expect(timeZoneOffsetMs(new Date('2026-01-15T12:00:00Z'), TASHKENT)).toBe(fiveHours);
    expect(timeZoneOffsetMs(new Date('2026-07-15T12:00:00Z'), TASHKENT)).toBe(fiveHours);
  });

  it('UTC uchun siljish nol', () => {
    expect(timeZoneOffsetMs(new Date('2026-08-10T00:00:00Z'), 'UTC')).toBe(0);
  });

  it("yozgi vaqti bor zonada siljish o'zgaradi", () => {
    // Berlin: qishda UTC+1, yozda UTC+2
    expect(timeZoneOffsetMs(new Date('2026-01-15T12:00:00Z'), 'Europe/Berlin')).toBe(3_600_000);
    expect(timeZoneOffsetMs(new Date('2026-07-15T12:00:00Z'), 'Europe/Berlin')).toBe(7_200_000);
  });
});

describe('hourInTimeZone', () => {
  it('UTC 04:00 — Toshkentda 09:00', () => {
    expect(hourInTimeZone(new Date('2026-08-10T04:00:00Z'), TASHKENT)).toBe(9);
  });

  it('yarim tunni 24 emas, 0 deb qaytaradi', () => {
    expect(hourInTimeZone(new Date('2026-08-09T19:00:00Z'), TASHKENT)).toBe(0);
  });
});

describe('nextOccurrenceOfHour (§3.3 — 09:00 Toshkent)', () => {
  it("belgilangan soatdan oldin bo'lsa — o'sha kuni", () => {
    // Toshkentda 2026-08-10 07:00 (UTC 02:00) → o'sha kuni 09:00
    const next = nextOccurrenceOfHour(9, TASHKENT, new Date('2026-08-10T02:00:00Z'));
    expect(next.toISOString()).toBe('2026-08-10T04:00:00.000Z');
  });

  it("belgilangan soatdan keyin bo'lsa — ertaga", () => {
    // Toshkentda 2026-08-10 16:00 (UTC 11:00) → ertangi kun 09:00
    const next = nextOccurrenceOfHour(9, TASHKENT, new Date('2026-08-10T11:00:00Z'));
    expect(next.toISOString()).toBe('2026-08-11T04:00:00.000Z');
  });

  it("aynan belgilangan soatda — keyingi kunga o'tadi (takror ishlamasin)", () => {
    const next = nextOccurrenceOfHour(9, TASHKENT, new Date('2026-08-10T04:00:00Z'));
    expect(next.toISOString()).toBe('2026-08-11T04:00:00.000Z');
  });

  it("oy va yil chegarasidan to'g'ri o'tadi", () => {
    // Toshkentda 2026-12-31 23:00 (UTC 18:00) → 2027-01-01 09:00
    const next = nextOccurrenceOfHour(9, TASHKENT, new Date('2026-12-31T18:00:00Z'));
    expect(next.toISOString()).toBe('2027-01-01T04:00:00.000Z');
  });

  it('natija har doim kelajakda', () => {
    const from = new Date('2026-08-10T11:00:00Z');
    for (const hour of [0, 6, 9, 12, 23]) {
      expect(nextOccurrenceOfHour(hour, TASHKENT, from).getTime()).toBeGreaterThan(from.getTime());
    }
  });
});
