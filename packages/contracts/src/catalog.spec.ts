import { describe, expect, it } from 'vitest';

import { buildDisplayName, slugifyCatalogName } from './catalog';

/**
 * Bu ikki funksiya kichik, lekin ularning buzilishi **jimgina** bo'ladi:
 *
 *  - `buildDisplayName` xato bo'lsa katalogdagi nomlar asta-sekin
 *    haqiqatdan chetlashadi va qidiruv topmay qo'yadi;
 *  - `slugifyCatalogName` xato bo'lsa §4.3 dagi dublikat to'sig'i yo
 *    o'tkazib yuboradi (bir brend ikki marta), yo soxta to'qnashuv beradi
 *    (butunlay boshqa nomni "band" deb rad etadi).
 */

describe('buildDisplayName (§4.6)', () => {
  it("to'liq telefon nomi", () => {
    expect(
      buildDisplayName({
        brandName: 'Apple',
        model: 'iPhone 15 Pro',
        storage: '256GB',
        color: 'Qora',
      }),
    ).toBe('Apple iPhone 15 Pro 256GB Qora');
  });

  it('§4.7 — aksessuarda xotira va rang bo‘sh qoladi', () => {
    expect(
      buildDisplayName({
        brandName: 'Apple',
        model: 'Lightning kabel',
        storage: null,
        color: null,
      }),
    ).toBe('Apple Lightning kabel');
  });

  it('faqat rang bor, xotira yo‘q', () => {
    expect(
      buildDisplayName({ brandName: 'Samsung', model: 'Galaxy A54', storage: null, color: 'Oq' }),
    ).toBe('Samsung Galaxy A54 Oq');
  });

  it('ichki qo‘sh probel yig‘iladi — aks holda ikki xil mahsulotdek ko‘rinadi', () => {
    expect(
      buildDisplayName({ brandName: ' Apple ', model: 'iPhone  15', storage: ' 128GB', color: '' }),
    ).toBe('Apple iPhone 15 128GB');
  });

  it('undefined ham null kabi tushib qoladi', () => {
    expect(buildDisplayName({ brandName: 'Xiaomi', model: 'Redmi 13' })).toBe('Xiaomi Redmi 13');
  });
});

describe('slugifyCatalogName (§4.3)', () => {
  /**
   * Eng muhim test: tutuq belgisining uch varianti bitta kalitga
   * tushmasa, bir brend bazada uch marta paydo bo'ladi.
   */
  it("o'zbek tutuq belgisining uch varianti — BITTA slug", () => {
    const variants = ["O'zbekiston", 'Oʻzbekiston', 'O’zbekiston'];
    const slugs = new Set(variants.map(slugifyCatalogName));

    expect(slugs.size).toBe(1);
    expect([...slugs][0]).toBe('ozbekiston');
  });

  it('registr va chekka probellar farq qilmaydi', () => {
    expect(slugifyCatalogName('  APPLE ')).toBe(slugifyCatalogName('apple'));
  });

  it('probel va tinish belgilari bitta chiziqchaga yig‘iladi', () => {
    expect(slugifyCatalogName('Samsung   Galaxy / A54')).toBe('samsung-galaxy-a54');
  });

  it('diakritika normallashadi — "Café" va "Cafe" bitta brend', () => {
    expect(slugifyCatalogName('Café')).toBe(slugifyCatalogName('Cafe'));
  });

  /**
   * ASCII-only folding bilan yozilsa, hamma kirill nom bo'sh slug'ga
   * tushib bir-biri bilan to'qnashardi.
   */
  it('kirill nom bo‘sh slug bermaydi va boshqasi bilan to‘qnashmaydi', () => {
    const samsung = slugifyCatalogName('Самсунг');
    const xiaomi = slugifyCatalogName('Сяоми');

    expect(samsung.length).toBeGreaterThan(0);
    expect(samsung).not.toBe(xiaomi);
  });

  it('faqat emojidan iborat nom barqaror zaxira kalit oladi', () => {
    const first = slugifyCatalogName('🙂🙂');
    const second = slugifyCatalogName('🙂🙂');
    const other = slugifyCatalogName('🚀');

    expect(first).toMatch(/^nom-/);
    // Barqaror: bir xil kirish har doim bir xil kalit
    expect(first).toBe(second);
    // Va turli kirishlar to'qnashmaydi
    expect(first).not.toBe(other);
  });

  it('chekka chiziqchalar qolmaydi', () => {
    expect(slugifyCatalogName('— Apple —')).toBe('apple');
  });
});
