import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Raw SQL qamrovi (§21.8, `ARCHITECTURE.md` §14.4).
 *
 * **Nega bu test bor.** Prisma extension'i tenant filtrini `$allOperations`
 * orqali qo'yadi, lekin u faqat MODEL amallarini ushlaydi — `$queryRaw` va
 * `$executeRaw` undan butunlay chetlab o'tadi. Ya'ni qo'lda yozilgan har
 * bir SQL o'z `shop_id` shartini o'zi olib yurishi kerak.
 *
 * Bu qoida bir marta buzilgan: `sale_counters` hisoblagichi `WHERE year = $1`
 * bilan yozilib, barcha tenant'larning qatorini birdan oshirgan (audit
 * topilmasi C1). Xato `hisobai_app` roliga o'tilgunicha DB darajasida ham
 * ushlanmasdi, chunki superuser RLS'ni chetlab o'tadi.
 *
 * **Nima tekshiriladi.** Ikkita mustaqil shart:
 *
 *  1. raw SQL chaqiruvlari SONI kutilganidan oshmasin — yangi joy qo'shilsa
 *     test qulaydi va yozuvchi bu yerga kelib ongli qaror qabul qiladi;
 *  2. har bir chaqiruv yo shop id'ga murojaat qilsin, yo quyidagi
 *     `TENANT_FREE` ro'yxatida SABABI bilan yozilgan bo'lsin.
 *
 * Bu — statik matn tekshiruvi, semantik tahlil emas. U "shart umuman bormi"
 * degan savolga javob beradi, "shart to'g'rimi" degan savolga emas —
 * ikkinchisi izolyatsiya integratsiya testlarining vazifasi
 * (`tenant-isolation.integration.spec.ts`).
 */

/**
 * `src` katalogi. Vitest `root` i `apps/api` (`vitest.config.mts`), ya'ni
 * `cwd` shu yerga ishora qiladi. `import.meta.url` ishlatilmadi: loyiha
 * `tsconfig` i CommonJS module'ga sozlangan va u yerda `import.meta`
 * taqiqlangan.
 */
const SRC = join(process.cwd(), 'src');

if (!existsSync(join(SRC, 'database'))) {
  throw new Error(`src katalogi topilmadi: ${SRC}. Testlar apps/api ildizidan ishga tushirilsin.`);
}

/**
 * Tenant tushunchasidan MUSTAQIL bo'lgan raw SQL joylari. Har biri shu
 * yerda sababi bilan yozilgan — ro'yxatga qo'shish ongli qaror bo'lsin.
 */
const TENANT_FREE: { file: string; contains: string; reason: string }[] = [
  {
    file: 'health/health.controller.ts',
    contains: 'SELECT 1',
    reason:
      "Ulanish tirikligini tekshirish. Hech qanday jadvalga tegmaydi, ya'ni tenant chegarasi mavzu emas.",
  },
];

interface RawSqlSite {
  file: string;
  sql: string;
}

/** Izohlar olib tashlanadi: ular ichida `$queryRaw` so'zi uchrashi mumkin. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    if (!full.endsWith('.ts') || full.endsWith('.spec.ts')) return [];
    return [full];
  });
}

function collectRawSqlSites(): RawSqlSite[] {
  const sites: RawSqlSite[] = [];

  for (const path of walk(SRC)) {
    const source = stripComments(readFileSync(path, 'utf8'));
    // `$queryRaw<T>` va `$executeRaw` — ikkalasi ham tagged template.
    // Unsafe variantlari ham ushlanadi: ular bo'lsa ham shu ro'yxatga tushsin.
    const pattern = /\$(?:query|execute)Raw(?:Unsafe)?(?:<[^>]*>)?\s*`([\s\S]*?)`/g;
    for (const match of source.matchAll(pattern)) {
      sites.push({ file: relative(SRC, path), sql: match[1] ?? '' });
    }
  }

  return sites.sort((a, b) => a.file.localeCompare(b.file) || a.sql.localeCompare(b.sql));
}

/**
 * Hozirgi holat: `sale_counters` uchun 2 ta (INSERT + UPDATE), `set_config`
 * uchun 2 ta (`decideOperation` va `decideTransaction` yo'llari), mahsulot
 * nomi advisory lock'i uchun 1 ta, health uchun 1 ta.
 */
const EXPECTED_SITE_COUNT = 6;

describe('raw SQL — tenant qamrovi (§21.8)', () => {
  const sites = collectRawSqlSites();

  it(`kod bazasida aynan ${String(EXPECTED_SITE_COUNT)} ta raw SQL joyi bor`, () => {
    // Xabar ataylab to'liq ro'yxat bilan: test qulaganda yozuvchi qaysi joy
    // qo'shilganini darhol ko'rsin.
    expect(sites.map((site) => site.file)).toHaveLength(EXPECTED_SITE_COUNT);
  });

  it('har bir raw SQL yo shop id bilan chegaralangan, yo sababi yozilgan', () => {
    const unscoped = sites.filter((site) => {
      if (/shop_?id/i.test(site.sql)) return false;
      return !TENANT_FREE.some(
        (allowed) => allowed.file === site.file && site.sql.includes(allowed.contains),
      );
    });

    expect(unscoped.map((site) => `${site.file}: ${site.sql.trim().replace(/\s+/g, ' ')}`)).toEqual(
      [],
    );
  });

  it('`sale_counters` ning ikkala bayonoti ham `shop_id` yozadi', () => {
    const counterSites = sites.filter((site) => site.sql.includes('sale_counters'));

    expect(counterSites).toHaveLength(2);
    for (const site of counterSites) {
      expect(site.sql).toMatch(/shop_id/);
    }
  });

  it("mahsulot nomi advisory lock kaliti Shop bo'yicha ajratilgan (§21.8)", () => {
    const lock = sites.find((site) => site.sql.includes('pg_advisory_xact_lock'));

    expect(lock).toBeDefined();
    // Ikki argumentli shakl: birinchisi Shop, ikkinchisi nom. Faqat nom
    // bo'yicha qulflansa, tenant'lar bir-birini kutib turardi.
    expect(lock?.sql).toMatch(/pg_advisory_xact_lock\(\s*hashtext\([^)]*\)\s*,\s*hashtext\(/);
  });
});
