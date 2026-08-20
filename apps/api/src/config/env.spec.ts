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

  /**
   * Standart qiymatlar dev qulayligi uchun; ular jimgina prodga o'tsa,
   * `local` drayver + repoda ochiq turgan kalit `@Public()` download
   * marshrutini imzo qalbakilashtirishga ochib qo'yardi. Konfiguratsiya
   * unutilgani ilovani xavfliroq qilmasligi kerak.
   */
  describe('ishlab chiqarish to‘siqlari', () => {
    const prod = { ...minimal, NODE_ENV: 'production' };

    it('prodda `local` storage drayverini rad etadi', () => {
      expect(() => validateEnv(prod)).toThrow(/STORAGE_DRIVER/);
    });

    it('prodda standart local kalitini rad etadi', () => {
      expect(() => validateEnv({ ...prod, STORAGE_DRIVER: 'minio' })).toThrow(
        /STORAGE_LOCAL_TOKEN_SECRET/,
      );
    });

    it("to'g'ri sozlangan prod konfiguratsiyasi o'tadi", () => {
      const env = validateEnv({
        ...prod,
        STORAGE_DRIVER: 'minio',
        STORAGE_LOCAL_TOKEN_SECRET: 'haqiqiy-maxfiy-kalit',
      });
      expect(env.NODE_ENV).toBe('production');
      expect(env.STORAGE_DRIVER).toBe('minio');
    });

    it("dev'da bu to'siqlar qo'llanmaydi", () => {
      expect(validateEnv(minimal).STORAGE_DRIVER).toBe('local');
    });
  });
});
