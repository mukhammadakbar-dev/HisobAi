import globals from 'globals';
import base from './base.js';

export default [
  ...base,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      /**
       * `import type` bu yerda XAVFLI: NestJS dependency injection
       * `emitDecoratorMetadata` orqali konstruktor parametrining RUNTIME
       * qiymatini o'qiydi. Import tip sifatida belgilansa u build paytida
       * o'chib ketadi va DI "Nest can't resolve dependencies" bilan yiqiladi.
       * Shuning uchun qoida API'da o'chirilgan.
       */
      '@typescript-eslint/consistent-type-imports': 'off',

      // NestJS modul klasslari bo'sh bo'ladi — bu normal
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
];
