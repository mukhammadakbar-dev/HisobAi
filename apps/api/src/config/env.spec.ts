import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

const minimal = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/hisob_ai',
  DATABASE_URL_APP: 'postgresql://hisobai_app:p@localhost:5432/hisob_ai',
};

describe('validateEnv', () => {
  it("DATABASE_URL bo'lmasa yiqiladi", () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  // §21.16 — ilova `hisobai_app` ostida ulanishi MAJBURIY. Fallback
  // `DATABASE_URL` ga tushsa, ilova jimgina superuser ostida ishlab
  // ketardi va RLS chetlab o'tilardi — nosozlik shovqinli bo'lishi shart.
  it("DATABASE_URL_APP bo'lmasa yiqiladi — DATABASE_URL ga fallback yo'q", () => {
    expect(() => validateEnv({ DATABASE_URL: minimal.DATABASE_URL })).toThrow(/DATABASE_URL_APP/);
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

  // .env dagi to'ldirilmagan qator bo'sh satr bo'lib keladi — u "berilmagan" deb qaralishi kerak,
  // aks holda API ishga tushmaydi.
  it("bo'sh satrni berilmagan deb qaraydi", () => {
    const env = validateEnv({ ...minimal, ADMIN_PASSWORD: '', VAPID_PUBLIC_KEY: '  ' });
    expect(env.ADMIN_PASSWORD).toBeUndefined();
    expect(env.VAPID_PUBLIC_KEY).toBeUndefined();
  });

  it("bo'sh satr standart qiymatni bekor qilmaydi", () => {
    expect(validateEnv({ ...minimal, PORT: '' }).PORT).toBe(4000);
    expect(validateEnv({ ...minimal, TIMEZONE: '' }).TIMEZONE).toBe('Asia/Tashkent');
  });

  it("to'ldirilgan ADMIN_PASSWORD hali ham tekshiriladi", () => {
    expect(() => validateEnv({ ...minimal, ADMIN_PASSWORD: 'qisqa' })).toThrow(/ADMIN_PASSWORD/);
  });

  // T-04 — `ConsoleMailProvider` parol tiklash havolasini (token bilan)
  // ochiq matnda logga yozadi (§2.6). Production'da bu tokenni oshkor
  // qiladi, shuning uchun bu birikma konfiguratsiya xatosi.
  const withFileSecret = { FILE_URL_SECRET: 'x'.repeat(32) };

  it('production + MAIL_PROVIDER=console — yiqiladi', () => {
    expect(() =>
      validateEnv({
        ...minimal,
        ...withFileSecret,
        NODE_ENV: 'production',
        MAIL_PROVIDER: 'console',
      }),
    ).toThrow(/MAIL_PROVIDER/);
  });

  it("production + MAIL_PROVIDER=smtp — o'tadi", () => {
    expect(() =>
      validateEnv({
        ...minimal,
        ...withFileSecret,
        NODE_ENV: 'production',
        MAIL_PROVIDER: 'smtp',
      }),
    ).not.toThrow();
  });

  it("development + MAIL_PROVIDER=console — o'tadi", () => {
    expect(() =>
      validateEnv({ ...minimal, NODE_ENV: 'development', MAIL_PROVIDER: 'console' }),
    ).not.toThrow();
  });

  // T-03 tayyorgarligi — §15.5 imzolangan fayl havolalari kaliti.
  it('production + FILE_URL_SECRET yo‘q — yiqiladi', () => {
    expect(() =>
      validateEnv({ ...minimal, NODE_ENV: 'production', MAIL_PROVIDER: 'smtp' }),
    ).toThrow(/FILE_URL_SECRET/);
  });

  it('production + FILE_URL_SECRET (32+ belgi) — o‘tadi', () => {
    const env = validateEnv({
      ...minimal,
      ...withFileSecret,
      NODE_ENV: 'production',
      MAIL_PROVIDER: 'smtp',
    });
    expect(env.FILE_URL_SECRET).toBe(withFileSecret.FILE_URL_SECRET);
  });

  it('development’da FILE_URL_SECRET ixtiyoriy', () => {
    const env = validateEnv(minimal);
    expect(env.FILE_URL_SECRET).toBeUndefined();
  });

  it('FILE_URL_SECRET 32 belgidan qisqa bo‘lsa rad etiladi', () => {
    expect(() => validateEnv({ ...minimal, FILE_URL_SECRET: 'qisqa' })).toThrow(
      /FILE_URL_SECRET/,
    );
  });
});
