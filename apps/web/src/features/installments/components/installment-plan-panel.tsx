'use client';

import {
  addMonthsClamped,
  generateMonthlySchedule,
  markupFromPercent,
  principalOf,
  roundMoney,
  sumMoney,
} from '@hisobai/contracts';
import type { Currency, ScheduleRow } from '@hisobai/contracts';

import { Money } from '../../../components/money/money';
import { MoneyInput } from '../../../components/money/money-input';
import { Button, Field, Input, Select } from '../../../components/ui';
import { ScheduleRowsEditor } from './schedule-rows-editor';

/**
 * Nasiya sharti va to'lov jadvali (§9) — savdo formasining ichida.
 *
 * **Jadval shu yerda tuziladi va serverga tayyor qatorlar ketadi**
 * (§9.5 — avtomatik, qo'lda yoki aralash). "Oylik" tugmasi qatorlarni
 * `generateMonthlySchedule` bilan yaratadi, keyin ularni qo'lda
 * tahrirlash mumkin — "aralash" variant aynan shu.
 *
 * Hisob-kitobning **hammasi `contracts` paketidan**: `principalOf`,
 * `markupFromPercent`, `generateMonthlySchedule`. Server ham aynan shu
 * funksiyalarni chaqiradi, ya'ni ekrandagi qarz serverning yozadigan
 * qarziga teng bo'ladi (`FRONTEND.md` §6.1). Ikki joyda ikki xil
 * yozilsa, ega "hammasi to'g'ri" ni ko'rib tugmani bosardi va server
 * §9.6 bilan rad etardi.
 */

export interface PlanState {
  downPayment: string;
  /** `amount` yoki `percent` — §9.3 ikkalasini birdan qabul qilmaydi. */
  markupMode: 'amount' | 'percent';
  markupValue: string;
  months: string;
  firstDueDate: string;
  rows: ScheduleRow[];
}

export function emptyPlan(): PlanState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    downPayment: '0',
    markupMode: 'percent',
    markupValue: '0',
    months: '6',
    // Birinchi to'lov — bir oydan keyin: bugungi kunga qo'yilgan muddat
    // savdo qilingan zahoti "bugun to'lash kerak" degani bo'lardi
    firstDueDate: addMonthsClamped(today, 1),
    rows: [],
  };
}

/** §17.3 — ustama summasi: to'g'ridan-to'g'ri yoki naqd narxdan foiz. */
export function markupOf(plan: PlanState, cashPrice: string, currency: Currency): string {
  if (plan.markupValue.trim() === '') return roundMoney('0', currency);
  return plan.markupMode === 'amount'
    ? roundMoney(plan.markupValue, currency)
    : markupFromPercent(cashPrice, plan.markupValue, currency);
}

/** §17.3 — naqd narx + ustama − boshlang'ich to'lov. */
export function principalFor(plan: PlanState, cashPrice: string, currency: Currency): string {
  return principalOf(
    {
      cashPrice,
      markupAmount: markupOf(plan, cashPrice, currency),
      downPayment: plan.downPayment.trim() === '' ? '0' : plan.downPayment,
    },
    currency,
  );
}

export function InstallmentPlanPanel({
  plan,
  cashPrice,
  currency,
  error,
  onChange,
}: {
  plan: PlanState;
  cashPrice: string;
  currency: Currency;
  error?: string;
  onChange: (next: PlanState) => void;
}) {
  const markup = markupOf(plan, cashPrice, currency);
  const principal = principalFor(plan, cashPrice, currency);
  const scheduleTotal = sumMoney(
    plan.rows.map((row) => row.amount),
    currency,
  );
  // §9.6 — jadval summasi qarzga TENG bo'lishi shart; farqni ekranda
  // ko'rsatamiz, aks holda ega faqat serverning xatosidan bilib olardi
  const balanced = plan.rows.length > 0 && scheduleTotal === principal;

  const patch = (changes: Partial<PlanState>): void => {
    onChange({ ...plan, ...changes });
  };

  const generate = (): void => {
    const months = Number.parseInt(plan.months, 10);
    if (!Number.isFinite(months) || months <= 0 || Number(principal) <= 0) return;

    patch({
      rows: generateMonthlySchedule({
        principal,
        currency,
        months: Math.min(months, 120),
        firstDueDate: plan.firstDueDate,
      }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Boshlang‘ich to‘lov" htmlFor="down-payment">
          <MoneyInput
            id="down-payment"
            currency={currency}
            value={plan.downPayment}
            onChange={(value) => {
              patch({ downPayment: value });
            }}
          />
        </Field>

        <Field label="Ustama turi" htmlFor="markup-mode">
          <Select
            id="markup-mode"
            value={plan.markupMode}
            onChange={(event) => {
              patch({ markupMode: event.target.value as PlanState['markupMode'] });
            }}
          >
            <option value="percent">Foiz</option>
            <option value="amount">Summa</option>
          </Select>
        </Field>

        <Field
          label={plan.markupMode === 'percent' ? 'Ustama, %' : 'Ustama summasi'}
          htmlFor="markup-value"
        >
          {plan.markupMode === 'percent' ? (
            <Input
              id="markup-value"
              inputMode="decimal"
              value={plan.markupValue}
              onChange={(event) => {
                patch({ markupValue: event.target.value });
              }}
            />
          ) : (
            <MoneyInput
              id="markup-value"
              currency={currency}
              value={plan.markupValue}
              onChange={(value) => {
                patch({ markupValue: value });
              }}
            />
          )}
        </Field>
      </div>

      {/* §16.3 — 0% boshlang'ich to'lov taqiqlanmaydi, lekin ogohlantiriladi */}
      {Number(plan.downPayment || '0') === 0 && (
        <p className="m-0 rounded-md bg-warning-bg p-3 text-sm text-warning">
          Boshlang‘ich to‘lovsiz nasiya — butun summa qarzga yoziladi.
        </p>
      )}

      <dl className="m-0 grid gap-2 rounded-md border border-border-default p-3 text-sm sm:grid-cols-3">
        <Figure label="Naqd narx (§17.3)" amount={cashPrice} currency={currency} />
        <Figure label="Ustama" amount={markup} currency={currency} />
        <Figure label="Qarz" amount={principal} currency={currency} strong />
      </dl>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Necha oy" htmlFor="months">
          <Input
            id="months"
            type="number"
            inputMode="numeric"
            min={1}
            max={120}
            value={plan.months}
            onChange={(event) => {
              patch({ months: event.target.value });
            }}
            className="w-24"
          />
        </Field>
        <Field label="Birinchi to‘lov" htmlFor="first-due">
          <Input
            id="first-due"
            type="date"
            value={plan.firstDueDate}
            onChange={(event) => {
              patch({ firstDueDate: event.target.value });
            }}
          />
        </Field>
        <Button type="button" onClick={generate}>
          Jadvalni tuzish
        </Button>
      </div>

      <ScheduleRowsEditor
        rows={plan.rows}
        currency={currency}
        onChange={(rows) => {
          patch({ rows });
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-default pt-3 text-sm">
        <span className="text-text-secondary">Jadval summasi</span>
        <span className={balanced ? 'font-semibold' : 'font-semibold text-danger'}>
          <Money amount={scheduleTotal} currency={currency} />
          {!balanced && plan.rows.length > 0 && (
            <span className="ml-2 font-normal">
              (qarz: <Money amount={principal} currency={currency} />)
            </span>
          )}
        </span>
      </div>

      {error && (
        <p className="m-0 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Figure({
  label,
  amount,
  currency,
  strong,
}: {
  label: string;
  amount: string;
  currency: Currency;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start">
      <dt className="text-text-secondary">{label}</dt>
      <dd className={`m-0 ${strong ? 'text-lg font-semibold' : 'font-medium'}`}>
        <Money amount={amount} currency={currency} />
      </dd>
    </div>
  );
}
