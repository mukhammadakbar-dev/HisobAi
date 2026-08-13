import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PLATFORM_ONLY_KEY, ROLES_KEY } from './auth.decorators';

/**
 * `ARCHITECTURE.md` §14.3 — "`@Roles()` va `@PlatformOnly()` bitta
 * endpointda ishlatilmaydi". `roles.guard.ts` va `platform-session.guard.ts`
 * bu ikkalasini turlicha talqin qiladi (biri business rolni tekshiradi,
 * ikkinchisi platforma sessiyasini RAD ETADI) — ikkalasi BIRGA qo'yilsa,
 * qaysi guard "haqiqiy" rad etuvchi ekani aniq bo'lmay qolardi.
 *
 * Bu **reviewer diqqatiga emas, strukturaga tayangan** tekshiruv
 * (`PlatformOnly()` izohidagi mulohaza): `src/` **dinamik** (`fs`
 * bilan, `.controller.ts` bo'yicha) skanerlanadi — yangi controller
 * qo'shilganda bu testga qo'lda qo'shilishi shart emas, aks holda
 * ro'yxat eskirib, aynan tekshirmoqchi bo'lgan holatni o'tkazib
 * yuborardi (`prisma.service.spec.ts`dagi DMMF skanerlash bilan bir
 * xil mulohaza). `import.meta.glob` (Vite) ATAYLAB ishlatilmaydi — bu
 * kod bazasi `tsc --noEmit` (CommonJS) bilan ham typecheck qilinadi va
 * `import.meta.glob` faqat ESM/Vite ostida mavjud.
 */
const SRC_ROOT = join(__dirname, '..');

function findControllerFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findControllerFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.controller.ts')) {
      files.push(full);
    }
  }
  return files;
}

interface ControllerClass {
  name: string;
  prototype: Record<string, unknown>;
}

function isControllerClass(value: unknown): value is ControllerClass {
  return typeof value === 'function' && 'prototype' in value;
}

async function collectControllerClasses(): Promise<ControllerClass[]> {
  const classes: ControllerClass[] = [];
  for (const file of findControllerFiles(SRC_ROOT)) {
    const module: Record<string, unknown> = await import(file);
    for (const exported of Object.values(module)) {
      if (isControllerClass(exported)) classes.push(exported);
    }
  }
  return classes;
}

describe('Struktura — @Roles() va @PlatformOnly() birga kelmaydi', () => {
  it('kamida bitta business va bitta platforma kontrolleri topildi (testning o‘zi ishlayaptimi)', async () => {
    // Bu tekshiruv testning "hech nima skanerlanmadi, shuning uchun
    // hech qachon qizarmaydi" degan jim muvaffaqiyatsizligining oldini
    // oladi — fayl yo'li noto'g'ri bo'lsa ham yuqoridagi test "yashil"
    // ko'rinardi.
    const classes = await collectControllerClasses();
    expect(classes.length).toBeGreaterThanOrEqual(10);
  });

  it('hech bir kontroller metodida @Roles() va @PlatformOnly() BIRGA kelmaydi', async () => {
    const classes = await collectControllerClasses();
    const violations: string[] = [];

    for (const cls of classes) {
      // Faqat haqiqiy metodlar (`get`/`set` accessor'lar emas — masalan
      // `private get isProduction()`): ular hech qachon route handler
      // bo'lolmaydi, o'qish esa getter'ni CHAQIRARDI (DI konstruktorsiz
      // ishga tushirilgan sinfda bu `undefined` xususiyatga tegib qulaydi).
      const methodNames = Object.getOwnPropertyNames(cls.prototype).filter((name) => {
        if (name === 'constructor') return false;
        const descriptor = Object.getOwnPropertyDescriptor(cls.prototype, name);
        return typeof descriptor?.value === 'function';
      });

      for (const methodName of methodNames) {
        const method = cls.prototype[methodName];
        const hasRoles =
          Reflect.getMetadata(ROLES_KEY, method as object) !== undefined ||
          Reflect.getMetadata(ROLES_KEY, cls) !== undefined;
        const hasPlatformOnly =
          Reflect.getMetadata(PLATFORM_ONLY_KEY, method as object) !== undefined ||
          Reflect.getMetadata(PLATFORM_ONLY_KEY, cls) !== undefined;

        if (hasRoles && hasPlatformOnly) {
          violations.push(`${cls.name}.${methodName}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
