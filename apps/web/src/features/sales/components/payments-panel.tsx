'use client';

import { PaymentMethod, convertMoney, sumMoney } from '@hisobai/contracts';
import type { CashAccountDto, Currency } from '@hisobai/contracts';
import { Plus, Trash2 } from 'lucide-react';

import { Money } from '../../../components/money/money';
import { MoneyInput } from '../../../components/money/money-input';
import { Badge, Button, Field, Select } from '../../../components/ui';
import { PAYMENT_METHOD_LABEL } from '../../../lib/labels';
import { randomId } from '../../../lib/random-id';

/**
 * To'lovlar paneli (§7.1, §17.10).
 *
 * Ikkita qoida ekranda ko'rinadi:
 *
 *  - **aralash to'lov** (§7.1): bitta savdoga bir nechta to'lov, har biri
 *    o'z usuli, hisobi va valyutasi bilan. Valyuta hisobdan kelib
 *    chiqadi — karta so'm hisobiga dollar tushmaydi (§11.1);
 *  - **naqd savdo to'liq to'lanadi** (§17.10): qoldiq nolga tushmaguncha
 *    tasdiqlash tugmasi ochilmaydi. "Qarz qoldi" degan holat naqd
 *    savdoda yo'q — u nasiya orqali rasmiylashtiriladi.
 *
 * Boshqa valyutadagi to'lov savdo valyutasiga **`convertMoney`** bilan
 * keltiriladi — server tasdiqlashda aynan shu funksiyani ishlatadi,
 * ya'ni ekrandagi qoldiq bilan serverning tekshiruvi bir xil javob
 * beradi (`FRONTEND.md` §6.1).
 */

export interface PaymentRow {
  key: string;
  method: PaymentMethod;
  cashAccountId: string;
  amount: string;
}

export function emptyPaymentRow(): PaymentRow {
  return {
    // React ro'yxat kaliti (`lib/random-id.ts`) — idempotency kaliti emas.
    key: randomId(),
    method: PaymentMethod.CASH,
    cashAccountId: '',
    amount: '',
  };
}

/** To'lovning savdo valyutasidagi qiymati; hisob yoki kurs yo'q bo'lsa `null`. */
export function appliedAmount(
  row: PaymentRow,
  accounts: CashAccountDto[],
  currency: Currency,
  storeRate: string | null,
): string | null {
  const account = accounts.find((candidate) => candidate.id === row.cashAccountId);
  if (!account || row.amount === '') return null;
  if (account.currency === currency) return row.amount;
  if (storeRate === null) return null;
  return convertMoney(row.amount, account.currency, currency, storeRate);
}

export function remainingAmount(
  rows: PaymentRow[],
  accounts: CashAccountDto[],
  currency: Currency,
  storeRate: string | null,
  total: string,
): string {
  const paid = rows.map((row) => appliedAmount(row, accounts, currency, storeRate) ?? '0');
  return sumMoney([total, ...paid.map((amount) => `-${amount}`)], currency);
}

export function PaymentsPanel({
  rows,
  accounts,
  currency,
  storeRate,
  total,
  issues,
  onChange,
}: {
  rows: PaymentRow[];
  accounts: CashAccountDto[];
  currency: Currency;
  storeRate: string | null;
  total: string;
  issues: Record<string, string>;
  onChange: (rows: PaymentRow[]) => void;
}) {
  const remaining = remainingAmount(rows, accounts, currency, storeRate, total);
  const isSettled = remaining === sumMoney(['0'], currency);

  const update = (index: number, patch: Partial<PaymentRow>): void => {
    onChange(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="flex flex-col gap-3">
      {issues.payments && (
        <p className="m-0 text-sm text-danger" role="alert">
          {issues.payments}
        </p>
      )}

      {rows.map((row, index) => {
        const account = accounts.find((candidate) => candidate.id === row.cashAccountId);
        const applied = appliedAmount(row, accounts, currency, storeRate);
        const crossCurrency = account !== undefined && account.currency !== currency;

        return (
          <fieldset
            key={row.key}
            className="m-0 flex flex-col gap-3 rounded-md border border-border-default p-3"
          >
            <legend className="px-1 text-sm font-medium text-text-secondary">
              {index + 1}-to‘lov
            </legend>

            <div className="flex flex-wrap gap-3">
              <div className="min-w-36 flex-1">
                <Field
                  label="Usul"
                  htmlFor={`method-${row.key}`}
                  error={issues[`payments.${String(index)}.method`]}
                >
                  <Select
                    id={`method-${row.key}`}
                    value={row.method}
                    onChange={(event) => {
                      update(index, { method: event.target.value as PaymentMethod });
                    }}
                  >
                    {Object.values(PaymentMethod).map((method) => (
                      <option key={method} value={method}>
                        {PAYMENT_METHOD_LABEL[method]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="min-w-48 flex-2">
                <Field
                  label="Kassa hisobi"
                  htmlFor={`account-${row.key}`}
                  error={issues[`payments.${String(index)}.cashAccountId`]}
                >
                  <Select
                    id={`account-${row.key}`}
                    value={row.cashAccountId}
                    onChange={(event) => {
                      update(index, { cashAccountId: event.target.value });
                    }}
                  >
                    <option value="">Tanlang</option>
                    {accounts.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name} ({option.currency})
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="min-w-40 flex-1">
                <Field
                  label={`Summa (${account?.currency ?? currency})`}
                  htmlFor={`amount-${row.key}`}
                  error={issues[`payments.${String(index)}.amount`]}
                >
                  <MoneyInput
                    id={`amount-${row.key}`}
                    currency={account?.currency ?? currency}
                    value={row.amount}
                    onChange={(value) => {
                      update(index, { amount: value });
                    }}
                  />
                </Field>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
              {/* §10.5 — kassaga haqiqiy pul o'z valyutasida tushadi,
                  savdo summasidan esa aylantirilgan qiymat ayriladi */}
              {crossCurrency && applied !== null && (
                <span>
                  Savdo valyutasida: <Money amount={applied} currency={currency} />
                </span>
              )}
              {crossCurrency && storeRate === null && (
                <span className="text-danger">
                  Bugungi kurs yo‘q — boshqa valyutadagi to‘lovni hisoblab bo‘lmaydi.
                </span>
              )}
              {/* §17.2 — o'tkazma Telegram cheki bilan qo'lda tasdiqlanadi */}
              {row.method === PaymentMethod.TRANSFER && (
                <Badge tone="warning">Kassaga tasdiqlangandan keyin tushadi</Badge>
              )}

              {rows.length > 1 && (
                <Button
                  type="button"
                  className="ml-auto"
                  onClick={() => {
                    onChange(rows.filter((_, position) => position !== index));
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" className="mr-2" />
                  Olib tashlash
                </Button>
              )}
            </div>
          </fieldset>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={rows.length >= 10}
          onClick={() => {
            onChange([...rows, emptyPaymentRow()]);
          }}
        >
          <Plus size={16} aria-hidden="true" className="mr-2" />
          Yana to‘lov
        </Button>

        <span className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-text-secondary">Qoldi:</span>
          <span className={isSettled ? 'font-semibold' : 'font-semibold text-warning'}>
            <Money amount={remaining} currency={currency} />
          </span>
        </span>
      </div>
    </div>
  );
}
