import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

const minimal = { DATABASE_URL: 'postgresql://u:p@localhost:5432/hisob_ai' };

describe('validateEnv', () => {
  it("DATABASE_URL bo'lmasa yiqiladi", () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it("standart qiymatlarni to'ldiradi", () => {
    const env = validateEnv(minimal);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.TIMEZONE).toBe('Asia/Tashkent');
    // §2.7 — sessiya 30 kun
    expect(env.SESSION_TTL_DAYS).toBe(30);
    // §2.9 — 5 urinish / 15 daqiqa
    expect(env.LOGIN_MAX_ATTEMPTS).toBe(5);
    expect(env.LOGIN_BLOCK_MINUTES).toBe(15);
    // §15.7 — 10 MB, §15.5 — 15 daqiqalik havola
    expect(env.MAX_UPLOAD_MB).toBe(10);
    expect(env.STORAGE_URL_TTL_MINUTES).toBe(15);
  });

  it('PORT ni satrdan songa aylantiradi', () => {
    expect(validateEnv({ ...minimal, PORT: '5000' }).PORT).toBe(5000);
  });

  it("noto'g'ri soatni rad etadi", () => {
    expect(() => validateEnv({ ...minimal, REMINDER_HOUR: '25' })).toThrow(/REMINDER_HOUR/);
  });
});
