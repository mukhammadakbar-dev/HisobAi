'use client';

import { RateStaleness, formatRate } from '@hisobai/contracts';
import type { TodayExchangeRateDto } from '@hisobai/contracts';
import { AlertTriangle, ChevronDown, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useSyncRateFromCbu } from '../../features/exchange-rates/queries';

export function RateBar({ data }: { data: TodayExchangeRateDto | undefined }) {
  const syncNow = useSyncRateFromCbu();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  if (!data || !data.rate) return null;

  const { rate, staleness, staleDays } = data;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Valyuta kursi ma'lumotlari"
        className="inline-flex min-h-9 sm:min-h-11 items-center gap-1 sm:gap-1.5 rounded-md border border-border-default bg-surface-card px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium text-text-primary whitespace-nowrap transition-colors hover:bg-surface-raised"
      >
        {staleness !== RateStaleness.FRESH && (
          <AlertTriangle size={14} aria-hidden="true" className="shrink-0 text-warning" />
        )}
        <span className="whitespace-nowrap">
          Kurs: <strong className="tabular">{formatRate(rate.storeRate)}</strong> so‘m
        </span>
        <ChevronDown
          size={13}
          aria-hidden="true"
          className={`shrink-0 text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Valyuta kursi ma'lumotlari"
          className="absolute right-0 top-full mt-2 w-72 sm:w-80 z-50 flex flex-col gap-3 rounded-lg border border-border-default bg-surface-card p-4 shadow-xl backdrop-blur-xs"
        >
          <div className="flex items-center justify-between border-b border-border-default pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Valyuta kursi
            </span>
            <span className="text-xs text-text-tertiary">{rate.date}</span>
          </div>

          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Do‘kon kursi:</span>
              <span className="font-semibold text-text-primary">
                <strong className="tabular">{formatRate(rate.storeRate)}</strong> so‘m
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-secondary">CBU kursi:</span>
              <span className="tabular text-text-secondary">
                {rate.cbuRate ? `${formatRate(rate.cbuRate)} so‘m` : '—'}
              </span>
            </div>

            {staleness !== RateStaleness.FRESH && (
              <div className="flex items-start gap-1.5 rounded-md bg-warning-bg p-2 text-xs font-medium text-warning">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Kurs {staleDays} kun eskirgan ({rate.date}). Sozlamalarda yangilang.
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              syncNow.mutate();
            }}
            disabled={syncNow.isPending}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-border-default bg-surface-card px-3 text-xs font-semibold text-text-primary transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              aria-hidden="true"
              className={syncNow.isPending ? 'animate-spin' : undefined}
            />
            <span>{syncNow.isPending ? 'Yangilanmoqda…' : 'Kursni yangilash'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
