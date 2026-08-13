'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'hisobai-theme';

/**
 * Mavzu tanlovi (TZ §2, `FRONTEND.md` §8.1).
 *
 * **Nega hook, nega komponent ichidagi `useState` emas.** Tugma bir
 * nechta joyda turadi (ilova sarlavhasi va Sozlamalar sahifasi). Har
 * biri o'z holatini saqlasa, birini bosganda ikkinchisi eski tanlovni
 * yoritib turadi — foydalanuvchi bir ekranda ikki xil javob ko'radi.
 *
 * Context emas, modul darajasidagi kichik store: mavzu — butun hujjatga
 * tegishli global holat, uni provider bilan o'rash ortiqcha qatlam
 * bo'lardi. `useSyncExternalStore` obunachilarni birdaniga xabardor
 * qiladi.
 *
 * Boshlang'ich qiymat `layout.tsx` dagi inline skript bilan mos: u
 * `localStorage` ni React yuklanishidan **oldin** o'qib, `data-theme`
 * ni qo'yadi — shuning uchun miltillash bo'lmaydi.
 */

const listeners = new Set<() => void>();

function readStored(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    // Shaxsiy rejim yoki bloklangan storage — mavzu tanlash ishlamaydi,
    // lekin ilova yiqilmaydi
    return 'system';
  }
}

let current: ThemeChoice | null = null;

function getSnapshot(): ThemeChoice {
  // Bir marta o'qiladi va keshlanadi: `useSyncExternalStore` snapshot
  // har render'da bir xil bo'lishini talab qiladi
  current ??= readStored();
  return current;
}

/**
 * Serverda `localStorage` yo'q. `'system'` qaytarish HTML va birinchi
 * client render'ini mos qiladi; haqiqiy tanlov allaqachon `data-theme`
 * atributida turgani uchun ekran to'g'ri ko'rinadi.
 */
function getServerSnapshot(): ThemeChoice {
  return 'system';
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function applyTheme(next: ThemeChoice): void {
  current = next;

  if (next === 'system') {
    document.documentElement.removeAttribute('data-theme');
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage yopiq — atribut baribir qo'yildi */
    }
  } else {
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage yopiq — tanlov shu sessiyada ishlaydi */
    }
  }

  listeners.forEach((listener) => {
    listener();
  });
}

/**
 * Ekranda AYNI PAYTDA turgan ko'rinish — `'system'` hal qilingan holda.
 *
 * Manba `data-theme` atributi: uni `layout.tsx` dagi skript React'dan
 * oldin qo'yadi, ya'ni atribut har doim ekrandagi haqiqatni bildiradi.
 * Atribut yo'q bo'lsa (tizim bo'yicha) — brauzerdan so'raladi, xuddi
 * CSS `@media` kabi.
 *
 * Faqat brauzerda chaqiriladi (bosish paytida), shuning uchun `document`
 * ga murojaat xavfsiz.
 */
function resolvedTheme(): 'light' | 'dark' {
  const attribute = document.documentElement.getAttribute('data-theme');
  if (attribute === 'dark' || attribute === 'light') return attribute;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme(): {
  theme: ThemeChoice;
  setTheme: (next: ThemeChoice) => void;
  toggleTheme: () => void;
} {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setTheme = useCallback((next: ThemeChoice) => {
    applyTheme(next);
  }, []);

  /**
   * Joriy ko'rinishni teskarisiga o'giradi.
   *
   * Tizim bo'yicha turgan foydalanuvchi uchun ham javob aniq: u ekranda
   * nimani ko'rsa, o'shaning aksiga o'tadi va tanlov shu daqiqadan
   * boshlab **qo'lda** bo'ladi. Tizimga qaytish — Sozlamalardagi
   * "Tizim bo'yicha" tugmasi.
   */
  const toggleTheme = useCallback(() => {
    applyTheme(resolvedTheme() === 'dark' ? 'light' : 'dark');
  }, []);

  return { theme, setTheme, toggleTheme };
}
