import { describe, expect, it } from 'vitest';

import { containsInsensitive, escapeLike } from './search';

/**
 * Qidiruvda joker belgi qolib ketsa, filtr jimgina teskari ishlaydi:
 * `%` hamma qatorni qaytaradi va foydalanuvchi buni "hech narsa
 * topilmadi" emas, "hammasi topildi" deb ko'radi.
 */
describe('escapeLike', () => {
  it('joker belgilarni oddiy belgiga aylantiradi', () => {
    expect(escapeLike('%')).toBe('\\%');
    expect(escapeLike('_')).toBe('\\_');
    expect(escapeLike('50%_off')).toBe('50\\%\\_off');
  });

  it("teskari chiziqning o'zini ham qochiradi", () => {
    // Usiz "A\" qidiruvi keyingi belgini yutib yuborardi
    expect(escapeLike('A\\')).toBe('A\\\\');
  });

  it('oddiy matnga tegmaydi', () => {
    expect(escapeLike('353917104876543')).toBe('353917104876543');
    expect(escapeLike('Apple iPhone 15 Pro')).toBe('Apple iPhone 15 Pro');
  });
});

describe('containsInsensitive', () => {
  it('Prisma filtri shaklida qaytadi', () => {
    expect(containsInsensitive('iPhone_15')).toEqual({
      contains: 'iPhone\\_15',
      mode: 'insensitive',
    });
  });
});
