import { z } from 'zod';

/**
 * Muhit o'zgaruvchilari ishga tushishda bir marta tekshiriladi.
 * Xato konfiguratsiya bilan ishga tushgandan ko'ra, darhol yiqilgan yaxshi:
 * v0.1 da noto'g'ri `DATABASE_URL` API'ni jimgina o'ldirar edi.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  /**
   * CLI va vositalar uchun (`prisma migrate dev`, `studio`, `seed`) —
   * `prisma.config.ts` shu manzilni o'qiydi. Development'da bu superuser
   * bo'lib qoladi: `migrate dev` shadow-baza yaratadi, `hisobai_migrate`
   * esa ataylab `NOCREATEDB` (§21.16). Ishlab chiqarishda deploy qadami
   * uni `hisobai_migrate` ga yo'naltiradi.
   *
   * **Ilova ishlash vaqtida bu manzildan FOYDALANMAYDI** — quyidagi
   * `DATABASE_URL_APP` ga qarang.
   */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL majburiy'),

  /**
   * §21.16 — ilova ishlash vaqtida **faqat** shu manzil orqali ulanadi
   * (`hisobai_app`: `NOSUPERUSER`, `NOBYPASSRLS`).
   *
   * Majburiy va fallback YO'Q. Fallback `DATABASE_URL` ga tushganda ilova
   * jimgina superuser ostida ishlab ketardi — superuser esa `FORCE ROW
   * LEVEL SECURITY` ni ham chetlab o'tadi, ya'ni §14.4 va'da qilgan
   * ikkinchi himoya qatlami mavjud bo'lmasdan turib, hamma narsa
   * ishlayotgandek ko'rinardi. Bunday nosozlik shovqinli bo'lishi shart.
   */
  DATABASE_URL_APP: z
    .string()
    .min(1, 'DATABASE_URL_APP majburiy — ilova `hisobai_app` roli ostida ulanadi (§21.16)'),

  /** Brauzerdan keladigan origin — CORS va cookie uchun. */
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),

  /** §2.7 — sessiya 30 kun. */
  SESSION_COOKIE_NAME: z.string().default('hisobai_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  /**
   * §21.3, `ARCHITECTURE.md` §14.3 — platforma (SUPERADMIN) sessiyasi
   * **alohida** cookie'da yuradi. Bir xil cookie nomi ishlatilsa, bitta
   * brauzerda business va platforma sessiyasi bir-birini ustidan yozib
   * yuborardi (ikkalasi ham `SameSite=Strict`, `path=/`) — admin business
   * panelida ochiq turgan holda `/platform/*`ga kirsa, business sessiyasi
   * jimgina o'chib qolardi.
   */
  PLATFORM_SESSION_COOKIE_NAME: z.string().default('hisobai_platform_session'),
  /** Platforma sessiyasi ham 30 kun — §2.7 bilan bir xil siyosat. */
  PLATFORM_SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),

  /** §2.9 — 5 marta xato → 15 daqiqa blok. */
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_BLOCK_MINUTES: z.coerce.number().int().positive().default(15),

  /** Hisobot kunlari va cron jadvali shu zonada hisoblanadi. */
  TIMEZONE: z.string().default('Asia/Tashkent'),
  /** §3.3 — CBU kursi 09:00 da olinadi. */
  RATE_SYNC_HOUR: z.coerce.number().int().min(0).max(23).default(9),
  /** §18 — eslatmalar shu soatda yuboriladi. */
  REMINDER_HOUR: z.coerce.number().int().min(0).max(23).default(9),
  CBU_API_URL: z.string().url().default('https://cbu.uz/uz/arkhiv-kursov-valyut/json/'),

  /** Birinchi egani yaratish uchun (faqat seed). */
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),

  /** §0.2 — MinIO, S3-mos. Kalitlar hech qachon repoga kirmaydi. */
  STORAGE_ENDPOINT: z.string().default('http://localhost:9000'),
  STORAGE_BUCKET: z.string().default('hisobai'),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  /** §15.5 — vaqtinchalik havola 15 daqiqa. */
  STORAGE_URL_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  /** §15.7 — 10 MB. */
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(10),

  PUSH_PROVIDER: z.enum(['console', 'webpush']).default('console'),
  VAPID_SUBJECT: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),

  SMS_PROVIDER: z.enum(['console']).default('console'),
  MAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  AI_PROVIDER: z.enum(['none', 'anthropic']).default('none'),
  AI_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * `.env` faylida to'ldirilmagan qator (`ADMIN_PASSWORD=`) `undefined` emas,
 * BO'SH SATR bo'lib keladi. U holda `.optional()` ishlamaydi va standart
 * qiymatlar ham qo'llanmaydi. Shuning uchun bo'sh satrlar tekshiruvdan
 * oldin olib tashlanadi — "to'ldirilmagan" degani "berilmagan" demakdir.
 */
function dropEmpty(raw: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value.trim() === '') continue;
    cleaned[key] = value;
  }
  return cleaned;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(dropEmpty(raw));
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Muhit o'zgaruvchilari noto'g'ri:\n${details}`);
  }
  return parsed.data;
}
