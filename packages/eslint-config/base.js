import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Barcha workspace'lar uchun umumiy qoidalar.
 * Loyiha qoidasi: pul hisobida `number` ishlatilmaydi — Prisma `Decimal`.
 * Buni lint ushlab qololmaydi, shuning uchun code review va testlar zimmasida.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', '.next/**', 'coverage/**', 'node_modules/**', '**/*.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
