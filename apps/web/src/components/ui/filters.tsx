'use client';

import { Search, X } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Ro'yxat sahifalarining filtr qatori (`design.md` §6).
 *
 * Ilgari har bir ro'yxat sahifasi o'z filtr kartochkasini qaytadan
 * yozardi — `Card` + `flex-wrap` + `Input` + `Select` — va natijada
 * ular bir-biriga o'xshamasdi: birida holat `Select`, boshqasida
 * checkbox, uchinchisida umuman yo'q. Endi bitta shakl: qidiruv +
 * chiplar + natija soni.
 *
 * Tanlangan filtr chip bo'lib ko'rinadi, ya'ni nima yoqilganini bilish
 * uchun panelni ochish shart emas — telefonda bu ayniqsa muhim.
 */

export function SearchInput({
  id,
  label,
  value,
  onChange,
  placeholder = 'Qidirish…',
}: {
  id: string;
  /** Ekran o'quvchisi uchun; ko'rinmaydi, lekin majburiy. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex min-h-11 flex-1 items-center gap-2.5 rounded-md border border-border-default bg-surface-card px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-action">
      <Search size={18} aria-hidden="true" className="shrink-0 text-text-tertiary" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        inputMode="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        // 16px — kichikroq bo'lsa iOS forma ochilganda sahifani zoom qiladi
        className="min-w-0 flex-1 bg-transparent py-2 text-base text-text-primary outline-none placeholder:text-text-tertiary"
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => {
            onChange('');
          }}
          aria-label="Qidiruvni tozalash"
          className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:text-text-primary"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
  dismissable = true,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /**
   * Yoqilgan chipda "×" ko'rinadi — uni bosish filtrni olib tashlaydi.
   * Bir-birini inkor qiluvchi tanlovlarda (faol / arxiv / hammasi)
   * `false` beriladi: u yerda "olib tashlash" degan holat yo'q, doim
   * bittasi tanlangan bo'ladi.
   */
  dismissable?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-sm whitespace-nowrap transition-colors ${
        active
          ? 'border-action bg-row-selected font-semibold text-action'
          : 'border-border-default bg-surface-card font-medium text-text-secondary hover:bg-surface-raised'
      }`}
    >
      {children}
      {active && dismissable && <X size={13} aria-hidden="true" className="shrink-0" />}
    </button>
  );
}

/**
 * Qidiruv va chiplarni bir joyga yig'adi.
 *
 * `count` — natija soni: ro'yxat filtrlanganda nechta yozuv qolganini
 * ko'rsatadi. Ilgari bu hech qayerda yozilmasdi va foydalanuvchi
 * ro'yxat kesilganini bilmasdi.
 */
export function FilterBar({
  children,
  chips,
  count,
  onReset,
}: {
  /** Odatda `SearchInput`. */
  children?: ReactNode;
  chips?: ReactNode;
  count?: ReactNode;
  onReset?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {children}

      {chips && <div className="flex flex-wrap gap-2">{chips}</div>}

      {(count !== undefined || onReset) && (
        <div className="flex items-center justify-between gap-3">
          {count !== undefined ? (
            <span className="tabular text-sm text-text-secondary">{count}</span>
          ) : (
            <span />
          )}
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="min-h-9 text-sm font-semibold text-action"
            >
              Filtrni tozalash
            </button>
          )}
        </div>
      )}
    </div>
  );
}
