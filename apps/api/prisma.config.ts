import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 da ulanish manzili schema faylida saqlanmaydi.
 * Bu konfiguratsiya faqat CLI uchun (migrate, studio, seed);
 * runtime ulanishi `src/database/prisma.service.ts` dagi adapter orqali.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'node --experimental-strip-types prisma/seed.ts',
  },
});
