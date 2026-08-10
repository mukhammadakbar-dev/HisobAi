/**
 * Audit uchun o'zgargan maydonlarni ajratib olish (§3.10).
 *
 * §3.10 "kim, qachon, **nimadan nimaga**" deb talab qiladi. Butun
 * obyektni yozish bu talabni rasman bajaradi, lekin amalda buzadi:
 * "ustama 0 dan 2 ga o'zgardi" degan javob 20 ta o'zgarmagan maydon
 * orasidan qidiriladi va jurnal o'qilmas bo'lib qoladi.
 *
 * `settings.service.ts` dan ko'chirildi — katalog moduli ham xuddi shu
 * hisobni talab qiladi (mahsulot va kategoriya tahriri).
 */

/**
 * Audit yozuvida har doim mavjud bo'lgani uchun diffdan chiqariladigan
 * maydonlar: ular har o'zgarishda farq qiladi va hech qanday ma'no
 * qo'shmaydi.
 */
const ALWAYS_SKIPPED = new Set(['updatedAt', 'updatedById', 'createdAt']);

export interface AuditDiff {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

/**
 * Ikki DTO ni solishtiradi va **faqat farq qilgan** maydonlarni qaytaradi.
 *
 * Solishtirish `JSON.stringify` bilan: massiv (`weekendDays`) va
 * `null` ni ham to'g'ri qamraydi, `===` esa massivda har doim `false`
 * berardi va har saqlash "o'zgardi" deb yozilardi.
 *
 * `skip` — modulga xos qo'shimcha maydonlar (masalan hisoblanadigan
 * `stock`, u yozuvning o'zgarishi emas).
 */
export function auditDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  skip: readonly string[] = [],
): AuditDiff {
  const skipped = new Set([...ALWAYS_SKIPPED, ...skip]);
  const beforeChanges: Record<string, unknown> = {};
  const afterChanges: Record<string, unknown> = {};

  for (const key of Object.keys(after)) {
    if (skipped.has(key)) continue;

    const previous = before[key];
    const next = after[key];
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;

    beforeChanges[key] = previous;
    afterChanges[key] = next;
  }

  return { before: beforeChanges, after: afterChanges };
}

/** Diffda umuman o'zgarish bormi — audit yozuvini yaratish kerakmi. */
export function hasChanges(diff: AuditDiff): boolean {
  return Object.keys(diff.after).length > 0;
}
