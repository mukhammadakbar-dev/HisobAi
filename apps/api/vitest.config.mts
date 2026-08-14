// `.env` shu yerda o'qiladi (Vite o'zi faqat `VITE_` prefiksli
// o'zgaruvchilarni oladi). Vitest ishchi oqimlari asosiy jarayonning
// `process.env` ini meros qilib oladi, ya'ni bitta import yetarli.
// Kerak bo'lish sababi: izolyatsiya integratsiya testlari
// (`*.integration.spec.ts`) `DATABASE_URL_TEST` ni o'qiydi; u berilmasa
// o'zlarini o'tkazib yuboradi.
import 'dotenv/config';
import { fileURLToPath } from 'node:url';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig'dagi `@/*` aliasi Vite resolveriga avtomatik o'tmaydi — bu yerda takrorlanadi.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    root: './',
  },
  // NestJS DI `emitDecoratorMetadata`ga tayanadi — esbuild uni qo'llab-quvvatlamaydi,
  // shuning uchun testlar SWC orqali kompilyatsiya qilinadi.
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
