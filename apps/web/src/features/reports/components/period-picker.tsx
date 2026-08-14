'use client';

import { Field, Input } from '../../../components/ui';
import type { Period } from '../queries';

/**
 * Davr tanlash (§13.9): kunlik, haftalik, oylik, yillik va ixtiyoriy
 * oraliq.
 *
 * Tayyor tugmalar **sanani to'ldiradi**, alohida "rejim" saqlamaydi.
 * Sabab: "oylik" tugmasini bosib, keyin sanani bir kunga surgan
 * foydalanuvchi hali ham oylik rejimdami degan savol tug'ilardi. Bu
 * yerda esa javob aniq — davr har doim ikkita sanadan iborat.
 */
export function PeriodPicker({
  period,
  onChange,
}: {
  period: Period;
  onChange: (period: Period) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              onChange(preset.build());
            }}
            className="inline-flex min-h-11 items-center rounded-md border border-border-default px-3 text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <Field label="Boshlanish" htmlFor="period-from">
        <Input
          id="period-from"
          type="date"
          value={period.from}
          max={period.to}
          onChange={(event) => {
            onChange({ ...period, from: event.target.value });
          }}
        />
      </Field>

      <Field label="Tugash" htmlFor="period-to">
        <Input
          id="period-to"
          type="date"
          value={period.to}
          min={period.from}
          onChange={(event) => {
            onChange({ ...period, to: event.target.value });
          }}
        />
      </Field>
    </div>
  );
}

/**
 * Standart davr — **shu oy boshidan bugungacha**.
 *
 * "Oxirgi 30 kun" emas: ega oylik hisobni oy chegarasi bo'yicha
 * yuritadi (ijara, maosh, hisobot) va "shu oy qancha ishladim" degan
 * savol shu oraliqda ma'noga ega.
 */
export function defaultPeriod(): Period {
  const today = new Date();
  return {
    from: startOfMonth(today),
    to: iso(today),
  };
}

const PRESETS = [
  { label: 'Bugun', build: (): Period => ({ from: iso(new Date()), to: iso(new Date()) }) },
  {
    label: 'Hafta',
    build: (): Period => ({ from: shift(-6), to: iso(new Date()) }),
  },
  { label: 'Shu oy', build: defaultPeriod },
  {
    label: 'Yil',
    build: (): Period => ({
      from: `${String(new Date().getFullYear())}-01-01`,
      to: iso(new Date()),
    }),
  },
];

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shift(days: number): string {
  return iso(new Date(Date.now() + days * 86_400_000));
}

function startOfMonth(date: Date): string {
  return `${iso(date).slice(0, 7)}-01`;
}
