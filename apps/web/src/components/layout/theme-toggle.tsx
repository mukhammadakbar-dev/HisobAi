'use client';

import { useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'hisobai-theme';

/**
 * Mavzu tanlash (TZ §2 — tanlov saqlanadi va tizim mavzusiga moslasha oladi).
 *
 * Uch holat: `system` — `data-theme` umuman qo'yilmaydi va `@media`
 * ishlaydi; `light`/`dark` — atribut qo'yiladi va media so'rovidan ustun
 * turadi (`globals.css` dagi `:not([data-theme='light'])` shuning uchun).
 *
 * MVP'da tanlov `localStorage` da; foydalanuvchi profili tayyor bo'lgach
 * `User.theme` ga ham yoziladi (`PATCH /settings`).
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('system');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') setChoice(stored);
  }, []);

  function apply(next: ThemeChoice): void {
    setChoice(next);
    if (next === 'system') {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem(STORAGE_KEY);
    } else {
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(STORAGE_KEY, next);
    }
  }

  const options: { value: ThemeChoice; label: string }[] = [
    { value: 'system', label: 'Tizim' },
    { value: 'light', label: "Yorug'" },
    { value: 'dark', label: "Qorong'i" },
  ];

  return (
    <div
      role="group"
      aria-label="Mavzu"
      className="inline-flex rounded-md border border-border-default p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={choice === option.value}
          onClick={() => {
            apply(option.value);
          }}
          className={`min-h-9 rounded-sm px-3 text-sm font-medium transition-colors ${
            choice === option.value
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
