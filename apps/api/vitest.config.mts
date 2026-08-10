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
