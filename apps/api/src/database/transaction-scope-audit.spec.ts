import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Tranzaksiya ichidan **boshqa ulanishga** so'rov yuborilmasin (§23.13).
 *
 * **Nega bu test manba matnini o'qiydi, xulq-atvorni emas.** Xato
 * faqat RLS yoqilgan haqiqiy bazada ko'rinadi: `set_config` tranzaksiya
 * ochilgan ULANISHDA ishlaydi (§21.14), boshqa ulanishda esa
 * `app.current_shop_id` yo'q va RLS hamma qatorni to'sadi. Mock'langan
 * testda RLS umuman ishtirok etmaydi, ya'ni 387 ta test ham buni
 * ko'rmagan edi — savdo umuman tasdiqlanmasligi ilovani qo'lda ishga
 * tushirgandagina aniqlandi.
 *
 * Xatoning shakli esa manbada aniq ko'rinadi: `$transaction` ichida
 * `this.<boshqaServis>.<metod>(` chaqirilgan va unga `tx` uzatilmagan.
 * Shuning uchun tekshiruv shu yerda.
 *
 * **To'g'ri yo'llar ikkita:**
 *  - `tx` ni birinchi argument qilib uzatish
 *    (`this.audit.record(tx, …)`, `this.cashEntries.createFromPayment(tx, …)`);
 *  - kerakli qiymatni tranzaksiyadan OLDIN o'qib, ichkariga tayyor
 *    holda kiritish (kurs bilan shunday qilingan — u snapshot qiymat,
 *    §1.7).
 */

/**
 * `apps/api/src` — `import.meta.dirname` ishlatilmaydi: `tsconfig`
 * `module` ni CommonJS'ga qo'ygan va u faqat ESM'da mavjud.
 * `__dirname` esa vitest'ning ESM transformida yo'q, shuning uchun
 * yo'l `process.cwd()` dan quriladi (vitest ildizi — `apps/api`).
 */
const SERVICE_ROOT = join(process.cwd(), 'src');

/** Ulanishga bormaydigan bog'liqliklar — ular tranzaksiyaga befarq. */
const HARMLESS = new Set(['logger', 'config', 'prisma', 'mail', 'throttle']);

interface Violation {
  file: string;
  line: number;
  call: string;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (!entry.endsWith('.ts') || entry.includes('.spec.')) continue;
    // Extension'ning o'zi — u ataylab `$transaction` bilan ishlaydi
    if (entry === 'prisma.service.ts') continue;
    out.push(path);
  }
  return out;
}

/** `$transaction(` dan keyingi qavs ichidagi to'liq tana. */
function transactionBodies(source: string): { body: string; line: number }[] {
  const bodies: { body: string; line: number }[] = [];

  for (const match of source.matchAll(/\$transaction\(/g)) {
    const start = (match.index ?? 0) + match[0].length - 1;
    let depth = 0;

    for (let index = start; index < source.length; index += 1) {
      if (source[index] === '(') depth += 1;
      else if (source[index] === ')') {
        depth -= 1;
        if (depth === 0) {
          bodies.push({
            body: source.slice(start, index),
            line: source.slice(0, match.index).split('\n').length,
          });
          break;
        }
      }
    }
  }
  return bodies;
}

function violationsIn(file: string): Violation[] {
  const source = readFileSync(file, 'utf8');
  const found: Violation[] = [];

  for (const { body, line } of transactionBodies(source)) {
    for (const call of body.matchAll(/this\.(\w+)\.(\w+)\(\s*([^,)\s]*)/g)) {
      const [, dependency, method, firstArgument] = call;
      if (dependency === undefined || HARMLESS.has(dependency)) continue;
      // `tx` uzatilgan — to'g'ri yo'l
      if (firstArgument === 'tx') continue;

      found.push({
        file: file.slice(SERVICE_ROOT.length + 1),
        line,
        call: `this.${dependency}.${String(method)}(`,
      });
    }
  }
  return found;
}

describe('tranzaksiya chegarasi (§23.13)', () => {
  it("tranzaksiya ichidan boshqa servisga `tx`siz so'rov yuborilmaydi", () => {
    const violations = sourceFiles(SERVICE_ROOT).flatMap(violationsIn);

    expect(
      violations,
      violations
        .map(
          (row) =>
            `${row.file}:${String(row.line)} — ${row.call} ga \`tx\` uzatilmagan. ` +
            "Tranzaksiya ichidan boshqa servisning `PrismaService` iga so'rov " +
            "boshqa ulanishga tushadi va RLS uni to'sadi (§23.13).",
        )
        .join('\n'),
    ).toEqual([]);
  });

  /**
   * Testning o'zi ishlayotganini tekshiradi: naqsh o'zgarsa (masalan
   * `$transaction` boshqacha chaqirilsa), yuqoridagi test jimgina
   * "buzilish yo'q" deb yashil bo'lib qolardi.
   */
  it('tranzaksiya bloklari umuman topiladi', () => {
    const total = sourceFiles(SERVICE_ROOT)
      .map((file) => transactionBodies(readFileSync(file, 'utf8')).length)
      .reduce((sum, count) => sum + count, 0);

    expect(total).toBeGreaterThan(20);
  });
});
