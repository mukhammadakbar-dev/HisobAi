'use client';

import { RateStaleness, formatRate } from '@hisobai/contracts';
import type { TodayExchangeRateDto } from '@hisobai/contracts';
import { AlertTriangle, ChevronDown, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useSyncRateFromCbu } from '../../features/exchange-rates/queries';
import { formatUzbekDate } from '../../lib/format';

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

  if (!data) return null;

  const { rate, staleness, staleDays } = data;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Valyuta kursi ma'lumotlari"
        className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-surface-raised px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-text-primary transition-opacity hover:opacity-80 sm:gap-1.5 md:min-h-[38px] md:gap-2 md:border md:border-border-default md:bg-transparent md:px-3 md:text-sm md:font-medium md:hover:bg-surface-raised"
      >
        {(!rate || staleness !== RateStaleness.FRESH) && (
          <AlertTriangle size={14} aria-hidden="true" className="shrink-0 text-warning" />
        )}
        <span className="whitespace-nowrap">
          {rate ? (
            <>
              Kurs: <strong className="tabular">{formatRate(rate.storeRate)}</strong> so‘m
            </>
          ) : (
            <>
              Kurs: <strong className="tabular text-warning">Belgilanmagan</strong>
            </>
          )}
        </span>
        <ChevronDown
          size={13}
          aria-hidden="true"
          className={`shrink-0 text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/*
        Mobilda popover viewport'ga bog'lanadi (`fixed inset-x-3`), `sm:`
        dan boshlab tugmaga (`absolute right-0`).

        Ilgari hamma joyda `absolute right-0 w-72` edi: popover o'ng cheti
        tugmaning o'ng cheti bilan tekislanadi, tugma esa ekran chetida
        emas — yonida ThemeToggle va "Chiqish" turadi. 390px kenglikda
        popover chap chetdan ~40px chiqib ketib, matni kesilardi.
      */}
      {open && (
        <div
          role="dialog"
          aria-label="Valyuta kursi ma'lumotlari"
          className="fixed inset-x-3 top-15 z-50 flex w-auto flex-col gap-3 rounded-lg border border-border-default bg-surface-card p-4 shadow-xl backdrop-blur-xs sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
        >
          <div className="flex items-center justify-between border-b border-border-default pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Valyuta kursi
            </span>
            <span className="text-xs text-text-tertiary">{formatUzbekDate(rate ? rate.date : data.today)}</span>
          </div>

          {rate ? (
            <>
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Sotish:</span>
                  <span className="font-semibold text-text-primary">
                    <strong className="tabular">{formatRate(rate.storeRate)}</strong> so‘m
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Olish:</span>
                  <span className="tabular text-text-secondary">
                    {rate.cbuRate ? `${formatRate(rate.cbuRate)} so‘m` : '—'}
                  </span>
                </div>

                {staleness !== RateStaleness.FRESH && (
                  <div className="flex items-start gap-1.5 rounded-md bg-warning-bg p-2 text-xs font-medium text-warning">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>
                      Kurs {staleDays} kun eskirgan ({formatUzbekDate(rate.date)})
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
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-md bg-warning-bg p-2.5 text-xs font-medium text-warning">
                <AlertTriangle size={14} className="shrink-0" />
                <span>Valyuta kursi hali belgilanmagan.</span>
              </div>

              <button
                type="button"
                onClick={() => syncNow.mutate()}
                disabled={syncNow.isPending}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-action px-3 text-xs font-semibold text-action-text transition-colors hover:opacity-90 disabled:opacity-50"
              >
                <RefreshCw
                  size={14}
                  className={syncNow.isPending ? 'animate-spin' : undefined}
                />
                <span>{syncNow.isPending ? 'Olinmoqda…' : 'CBU’dan olingan kursni o‘rnatish'}</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
