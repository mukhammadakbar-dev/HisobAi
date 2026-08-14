'use client';

import { addMonthsClamped } from '@hisobai/contracts';
import type { Currency, ScheduleRow } from '@hisobai/contracts';
import { Plus, Trash2 } from 'lucide-react';

import { MoneyInput } from '../../../components/money/money-input';
import { Button, Input } from '../../../components/ui';

/**
 * Jadval qatorlarini qo'lda tahrirlash (§9.5).
 *
 * Ikki joyda ishlatiladi: savdo formasidagi yangi jadval va shartnoma
 * kartasidagi qayta tuzish (§9.10). Ikkalasida ham qoida bir xil —
 * sana va summa erkin o'zgaradi, tenglikni esa yig'indi bo'yicha
 * tekshiruv hal qiladi (§9.6, §9.11). Shuning uchun bitta komponent:
 * ikki nusxada ular asta-sekin bir-biridan farq qila boshlardi.
 */
export function ScheduleRowsEditor({
  rows,
  currency,
  onChange,
}: {
  rows: ScheduleRow[];
  currency: Currency;
  onChange: (rows: ScheduleRow[]) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="m-0 text-sm text-text-tertiary">
        Jadval bo‘sh — qator qo‘shing yoki oylik jadval tuzing.
      </p>
    );
  }

  const patchRow = (index: number, changes: Partial<ScheduleRow>): void => {
    onChange(rows.map((row, position) => (position === index ? { ...row, ...changes } : row)));
  };

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <span className="tabular w-8 text-sm text-text-secondary">{index + 1}.</span>
          <Input
            id={`schedule-date-${String(index)}`}
            type="date"
            aria-label={`${String(index + 1)}-to‘lov sanasi`}
            value={row.dueDate}
            onChange={(event) => {
              patchRow(index, { dueDate: event.target.value });
            }}
          />
          <MoneyInput
            id={`schedule-amount-${String(index)}`}
            currency={currency}
            value={row.amount}
            onChange={(value) => {
              patchRow(index, { amount: value });
            }}
          />
          <button
            type="button"
            aria-label={`${String(index + 1)}-qatorni o‘chirish`}
            onClick={() => {
              onChange(rows.filter((_, position) => position !== index));
            }}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-text-secondary hover:text-danger"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      ))}

      <Button
        type="button"
        className="self-start"
        onClick={() => {
          const last = rows[rows.length - 1];
          onChange([
            ...rows,
            {
              dueDate: last
                ? addMonthsClamped(last.dueDate, 1)
                : new Date().toISOString().slice(0, 10),
              amount: '0',
            },
          ]);
        }}
      >
        <Plus size={16} aria-hidden="true" />
        <span className="ml-1">Qator qo‘shish</span>
      </Button>
    </div>
  );
}
