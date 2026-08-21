'use client';

import type { ReactNode } from 'react';

/**
 * Bo'limlar (`design.md` §6).
 *
 * Nasiya shartnomasi kabi ekranlarda ma'lumot uch qismga bo'linadi
 * (jadval / tarix / hujjatlar) va ular telefonda birin-ketin uzun
 * ustunga tizilib ketardi. Bo'limlar bilan ekranga bittasi sig'adi.
 *
 * `role="tablist"` va o'q tugmalari ataylab QO'YILMAGAN: bu oddiy
 * havolasiz almashtirgich, klaviatura bilan Tab orqali kezib chiqiladi.
 * To'liq ARIA tablar naqshi panel bilan bog'lanishni talab qiladi —
 * bu yerda esa panel shunchaki keyingi blok.
 */

export interface TabItem {
  id: string;
  label: string;
  /** Yonidagi son — masalan to'lovlar soni. */
  badge?: ReactNode;
}

export function Tabs({
  items,
  active,
  onChange,
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border-default">
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onChange(item.id);
            }}
            aria-current={isActive ? 'true' : undefined}
            className={`-mb-px flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm whitespace-nowrap transition-colors ${
              isActive
                ? 'border-action font-semibold text-action'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {item.label}
            {item.badge !== undefined && (
              <span className="tabular text-xs text-text-tertiary">{item.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
