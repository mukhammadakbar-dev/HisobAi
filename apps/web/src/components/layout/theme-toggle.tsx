'use client';

import { Moon, Sun } from 'lucide-react';

import { useTheme } from '../../hooks/use-theme';

/**
 * Mavzu tugmasi (TZ §2 — tanlov saqlanadi va tizim mavzusiga moslasha oladi).
 *
 * Bitta tugma, ikkita ikonka: yorug'da **oy** (bosilsa qorong'iga
 * o'tadi), qorong'ida **quyosh**. Uchta tugmali tanlov o'rniga shu
 * ataylab: kundalik amal bitta — "ko'zimga yorug'/qorong'i keldi", va u
 * bir bosishda bajarilishi kerak. Tizim rejimiga qaytish kamdan-kam
 * kerak bo'ladi, shuning uchun u Sozlamalarda (`ThemeSystemReset`).
 *
 * Qaysi ikonka ko'rinishini **CSS** hal qiladi (`globals.css` dagi
 * `.theme-light-only` / `.theme-dark-only`), React emas: `data-theme`
 * sahifa chizilishidan oldin qo'yiladi va serverdagi render mavzuni
 * bilmaydi — JS bilan tanlansa, tugma bir zum noto'g'ri ikonka bilan
 * miltillardi.
 *
 * Holat `useTheme` da (`hooks/use-theme.ts`), komponent ichida emas:
 * tugma bir nechta joyda turadi (sarlavha va Sozlamalar) va ular bir
 * xil javob berishi kerak.
 *
 * MVP'da tanlov `localStorage` da; foydalanuvchi profili tayyor bo'lgach
 * `User.theme` ga ham yoziladi (`PATCH /settings`).
 */
export function ThemeToggle() {
  const { toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Mavzuni almashtirish"
      className="inline-flex min-h-9 min-w-9 sm:min-h-11 sm:min-w-11 shrink-0 items-center justify-center rounded-md border border-border-default text-text-secondary transition-colors hover:bg-surface-raised"
    >
      {/* Ikonka ham, matn ham juft: ekran o'quvchisi tugma nima
          qilishini o'qiydi, ko'zi bilan ko'radigan esa ikonkani */}
      <span className="theme-light-only items-center">
        <Moon size={20} aria-hidden="true" />
        <span className="sr-only">Qorong‘i rejimga o‘tish</span>
      </span>
      <span className="theme-dark-only items-center">
        <Sun size={20} aria-hidden="true" />
        <span className="sr-only">Yorug‘ rejimga o‘tish</span>
      </span>
    </button>
  );
}

/**
 * "Tizim bo'yicha" — qo'lda tanlovni bekor qiladi.
 *
 * Alohida komponent, chunki u faqat Sozlamalarda kerak: qo'lda tanlov
 * qilinmagan bo'lsa umuman ko'rinmaydi — bosib bo'lmaydigan yoki hech
 * narsa qilmaydigan tugma ko'rsatilmaydi.
 */
export function ThemeSystemReset() {
  const { theme, setTheme } = useTheme();

  if (theme === 'system') return null;

  return (
    <button
      type="button"
      onClick={() => {
        setTheme('system');
      }}
      className="min-h-11 rounded-md px-2 text-sm font-medium text-link hover:underline"
    >
      Tizim bo‘yicha
    </button>
  );
}
