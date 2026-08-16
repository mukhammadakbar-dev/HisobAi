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
 *
 * **Bir qavat vositalilik.** `$transaction` tanasida ba'zan boshqa
 * servisga emas, SHU SINFNING shaxsiy metodiga (`this.<metod>(`, bitta
 * nuqta) qo'ng'iroq qilinadi va aynan o'sha metod ichida chaqiruv
 * `tx`siz ketadi (masalan `exchange-rates.service.ts`dagi
 * `applyCbuRateToShop` → `auditSync` xatosi — T-02). Bunday chaqiruv
 * `this.(\w+)\.(\w+)\(` naqshiga mos kelmaydi, chunki oraliqda ikkinchi
 * nuqta yo'q. Shuning uchun bu skript shaxsiy metod chaqiruvlarini ham
 * topadi, o'sha metodning tanasini SHU FAYLDA qidiradi va uning ichidagi
 * `this.<bog'liqlik>.<metod>(` chaqiruvlarini xuddi shu qoidalar bilan
 * tekshiradi. Bu FAQAT bitta qavatni qamraydi — agar shaxsiy metod o'z
 * navbatida yana boshqa shaxsiy metodni chaqirsa (ikki qavat vositalilik),
 * bu skript buni KO'RMAYDI. Bu ataylab qilingan chegara: sodda regex
 * asosidagi tekshiruv chuqur rekursiyaga borsa, o'zi ham xato qiluvchi
 * murakkab parserga aylanadi. Amalda servislar bunchalik chuqur
 * vositalanmaydi.
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
function transactionBodies(source: string): { body: string; start: number; line: number }[] {
  const bodies: { body: string; start: number; line: number }[] = [];

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
            start,
            line: source.slice(0, match.index).split('\n').length,
          });
          break;
        }
      }
    }
  }
  return bodies;
}

/**
 * Berilgan matn bo'lagi ichidagi `this.<bog'liqlik>.<metod>(` chaqiruvlarini
 * topadi va `tx`siz ketganlarini xato deb belgilaydi. `bodyStart` — bu
 * bo'lakning asl manbadagi boshlanish indeksi, faqat to'g'ri qator raqamini
 * hisoblash uchun kerak.
 */
function dependencyViolations(
  source: string,
  body: string,
  bodyStart: number,
  file: string,
): Violation[] {
  const found: Violation[] = [];
  for (const call of body.matchAll(/this\.(\w+)\.(\w+)\(\s*([^,)\s]*)/g)) {
    const [, dependency, method, firstArgument] = call;
    if (dependency === undefined || HARMLESS.has(dependency)) continue;
    // `tx` uzatilgan — to'g'ri yo'l
    if (firstArgument === 'tx') continue;

    found.push({
      file: file.slice(SERVICE_ROOT.length + 1),
      line: source.slice(0, bodyStart + (call.index ?? 0)).split('\n').length,
      call: `this.${dependency}.${String(method)}(`,
    });
  }
  return found;
}

/**
 * SHU FAYLDA e'lon qilingan `methodName` metodining tanasini (jingalak
 * qavslar orasi) qidiradi. Faqat sinf a'zosi bo'lgan metodlar uchun ishlaydi
 * — imzo qatorida `(` boshlanishidan oldin balanslangan qavs (parametrlar),
 * so'ng birinchi `{` dan balanslangan `}` gacha (`transactionBodies` bilan
 * bir xil usul). Topilmasa (masalan boshqa faylda e'lon qilingan bo'lsa)
 * `null` — bu holat sukut bo'yicha o'tkazib yuboriladi (§ yuqoridagi izoh).
 */
function methodBody(source: string, methodName: string): { body: string; start: number } | null {
  const defRe = new RegExp(`\\n[ \\t]*(?:private |public |protected )?(?:static )?(?:async )?${methodName}\\s*\\(`);
  const match = defRe.exec(source);
  if (!match) return null;

  let depth = 0;
  let index = match.index + match[0].length - 1;
  for (; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    else if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
  }

  const braceStart = source.indexOf('{', index);
  if (braceStart === -1) return null;

  let braceDepth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') braceDepth += 1;
    else if (source[i] === '}') {
      braceDepth -= 1;
      if (braceDepth === 0) {
        return { body: source.slice(braceStart + 1, i), start: braceStart + 1 };
      }
    }
  }
  return null;
}

function violationsIn(file: string): Violation[] {
  const source = readFileSync(file, 'utf8');
  const found: Violation[] = [];

  for (const { body, start } of transactionBodies(source)) {
    found.push(...dependencyViolations(source, body, start, file));

    // Bir qavat vositalilik: shaxsiy metod chaqiruvi (`this.<metod>(`,
    // ikkinchi nuqtasiz) — uning tanasini shu faylda topib, o'sha yerdagi
    // bog'liqlik chaqiruvlarini ham tekshiramiz (yuqoridagi klass izohi).
    for (const call of body.matchAll(/this\.(\w+)\(/g)) {
      const methodName = call[1];
      if (methodName === undefined) continue;
      const resolved = methodBody(source, methodName);
      if (!resolved) continue; // shu faylda e'lon qilinmagan — o'tkazib yuboriladi

      found.push(...dependencyViolations(source, resolved.body, resolved.start, file));
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
