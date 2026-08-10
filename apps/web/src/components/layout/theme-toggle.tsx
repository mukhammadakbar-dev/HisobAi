'use client';

import { useTheme, type ThemeChoice } from '../../hooks/use-theme';

/**
 * Mavzu tanlash (TZ §2 — tanlov saqlanadi va tizim mavzusiga moslasha oladi).
 *
 * Uch holat: `system` — `data-theme` umuman qo'yilmaydi va `@media`
 * ishlaydi; `light`/`dark` — atribut qo'yiladi va media so'rovidan ustun
 * turadi (`globals.css` dagi `:not([data-theme='light'])` shuning uchun).
 *
 * Holat `useTheme` da (`hooks/use-theme.ts`), komponent ichida emas:
 * tugma bir nechta joyda turadi va ular bir xil javob berishi kerak.
 *
 * MVP'da tanlov `localStorage` da; foydalanuvchi profili tayyor bo'lgach
 * `User.theme` ga ham yoziladi (`PATCH /settings`).
 */
const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Tizim' },
  { value: 'light', label: "Yorug'" },
  { value: 'dark', label: "Qorong'i" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="group"
      aria-label="Mavzu"
      className="inline-flex rounded-md border border-border-default p-0.5"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={theme === option.value}
          onClick={() => {
            setTheme(option.value);
          }}
          className={`min-h-9 rounded-sm px-3 text-sm font-medium transition-colors ${
            theme === option.value
              ? 'bg-action text-action-text'
              : 'text-text-secondary hover:bg-surface-raised'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
