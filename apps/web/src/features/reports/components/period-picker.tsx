'use client';

import { useState } from 'react';

import { Field, Input } from '../../../components/ui';
import { FilterChip } from '../../../components/ui/filters';
import type { Period } from '../queries';

/**
 * Davr tanlash (§13.9): kunlik, haftalik, oylik, o'tgan oy va ixtiyoriy
 * oraliq.
 *
 * Tayyor chiplar **95% holatda yetadi** — sotuvchi eng ko'p "bugun" yoki
 * "shu oy" ni tanlaydi. Kalendar shuning uchun doim ochiq turmaydi:
 * faqat "Oraliq…" bosilganda ko'rinadi, aks holda ekranni band qiladi.
 *
 * Tayyor tugma **sanani to'ldiradi**, alohida "rejim" saqlamaydi.
 * Sabab: "oylik" tugmasini bosib, keyin sanani bir kunga surgan
 * foydalanuvchi hali ham oylik rejimdami degan savol tug'ilardi. Bu
 * yerda esa javob aniq — davr har doim ikkita sanadan iborat va faol
 * chip joriy davrga solishtirib topiladi.
 */
export function PeriodPicker({
  period,
  onChange,
}: {
  period: Period;
  onChange: (period: Period) => void;
}) {
  const activePreset = PRESETS.find((preset) => {
    const built = preset.build();
    return built.from === period.from && built.to === period.to;
  });
  const [customOpen, setCustomOpen] = useState(activePreset === undefined);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <FilterChip
            key={preset.label}
            active={activePreset?.label === preset.label}
            dismissable={false}
            onClick={() => {
              setCustomOpen(false);
              onChange(preset.build());
            }}
          >
            {preset.label}
          </FilterChip>
        ))}
        <FilterChip
          active={customOpen}
          dismissable={false}
          onClick={() => {
            setCustomOpen((open) => !open);
          }}
        >
          Oraliq…
        </FilterChip>
      </div>

      {customOpen && (
        <div className="flex flex-wrap items-end gap-3">
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
      )}
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
    label: 'Shu hafta',
    build: (): Period => ({ from: shift(-6), to: iso(new Date()) }),
  },
  { label: 'Shu oy', build: defaultPeriod },
  { label: 'Oldingi oy', build: previousMonth },
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

function previousMonth(): Period {
  const today = new Date();
  const lastDayOfPreviousMonth = new Date(today.getFullYear(), today.getMonth(), 0);
  const firstDayOfPreviousMonth = new Date(
    lastDayOfPreviousMonth.getFullYear(),
    lastDayOfPreviousMonth.getMonth(),
    1,
  );
  return { from: iso(firstDayOfPreviousMonth), to: iso(lastDayOfPreviousMonth) };
}
