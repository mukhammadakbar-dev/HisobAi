import { describe, expect, it } from 'vitest';

import {
  getShopId,
  isNoShopScope,
  requireShopId,
  runWithoutShopScope,
  runWithShopScope,
} from './shop-context';

/**
 * `AsyncLocalStorage` asosidagi Shop konteksti — `PrismaService` extension'i
 * shu yerdan o'qiydi (§14.4, §21.7). Uch holat bir-biridan aniq ajratilishi
 * shart: kontekst yo'q, kontekst bor, va ataylab scope'siz.
 */
describe('shop-context', () => {
  it('kontekst kiritilmagan bo‘lsa getShopId() null qaytaradi', () => {
    expect(getShopId()).toBeNull();
    expect(isNoShopScope()).toBe(false);
  });

  it('runWithShopScope ichida getShopId() shopId qaytaradi', () => {
    runWithShopScope('shop-1', () => {
      expect(getShopId()).toBe('shop-1');
      expect(isNoShopScope()).toBe(false);
    });
  });

  it('runWithShopScope tugagach kontekst tashqariga sizib chiqmaydi', () => {
    runWithShopScope('shop-1', () => {
      // ichkarida
    });
    expect(getShopId()).toBeNull();
  });

  it('ichma-ich runWithShopScope — ichkisi tashqisini vaqtincha bosib turadi, keyin tiklanadi', () => {
    runWithShopScope('shop-outer', () => {
      expect(getShopId()).toBe('shop-outer');
      runWithShopScope('shop-inner', () => {
        expect(getShopId()).toBe('shop-inner');
      });
      expect(getShopId()).toBe('shop-outer');
    });
  });

  it('runWithoutShopScope ichida getShopId() null, lekin isNoShopScope() true', () => {
    runWithoutShopScope(() => {
      expect(getShopId()).toBeNull();
      expect(isNoShopScope()).toBe(true);
    });
  });

  it('runWithoutShopScope tugagach kontekst tashqariga sizib chiqmaydi', () => {
    runWithoutShopScope(() => {
      // ichkarida
    });
    expect(isNoShopScope()).toBe(false);
    expect(getShopId()).toBeNull();
  });

  it('runWithoutShopScope Shop scope’ni vaqtincha bosib turadi, keyin tiklanadi', () => {
    runWithShopScope('shop-1', () => {
      runWithoutShopScope(() => {
        expect(getShopId()).toBeNull();
        expect(isNoShopScope()).toBe(true);
      });
      expect(getShopId()).toBe('shop-1');
      expect(isNoShopScope()).toBe(false);
    });
  });

  it('async davomiylikda ham kontekst saqlanadi', async () => {
    await runWithShopScope('shop-1', async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(getShopId()).toBe('shop-1');
    });
  });

  it('requireShopId() kontekst bor bo‘lsa shopId qaytaradi', () => {
    runWithShopScope('shop-1', () => {
      expect(requireShopId()).toBe('shop-1');
    });
  });

  it('requireShopId() kontekst yo‘q bo‘lsa xato tashlaydi', () => {
    expect(() => requireShopId()).toThrow();
  });

  it('requireShopId() ataylab scope’siz blokda ham xato tashlaydi', () => {
    runWithoutShopScope(() => {
      expect(() => requireShopId()).toThrow();
    });
  });
});
