'use client';

import { Currency, formatMoney, formatRate, roundMoney } from '@hisobai/contracts';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button, Card, Field, Input, Select } from '../../../components/ui';

/**
 * Kalkulyator (§12).
 *
 * Uchta qoida shu komponentda bajariladi:
 *
 *  1. **Serverga so'rov yubormaydi** (§12.3) — hisob butunlay brauzerda,
 *     internet uzilganda ham ishlaydi. Kurs ham tashqaridan (savdo
 *     formasidagi bugungi kurs) prop bo'lib keladi, o'zi so'ramaydi;
 *  2. **Moliyaviy yozuv yaratmaydi** (§12.4) — natija faqat narx
 *     maydoniga o'tkaziladi va o'sha yerda valyuta qoidasi bo'yicha
 *     yaxlitlanadi;
 *  3. **Oxirgi 10 ta hisob brauzer xotirasida** (§12.5), serverga
 *     yuborilmaydi.
 *
 * v0.1 dagi "chegirma / ustama / bo'lib to'lash" rejimlari **yo'q**
 * (§12.2): chegirma maydoni umuman olib tashlangan (§7.3), ustama
 * nasiya formasida (§9.3).
 *
 * Suzuvchi tugma sifatida **qo'yilmagan**: `FRONTEND.md` §4 bo'yicha
 * ekranda faqat bitta suzuvchi tugma bo'ladi — "Yangi savdo" (§14.6).
 * Shuning uchun kalkulyator narx maydonining yonidan ochiladi (§12.6).
 */

const HISTORY_KEY = 'hisobai.calculator.history';
const HISTORY_LIMIT = 10;

/**
 * Ifodani hisoblaydi: `+ − × ÷` va qavslarsiz, chapdan o'ngga emas —
 * ko'paytirish/bo'lish ustunligi bilan.
 *
 * `eval` ATAYLAB ishlatilmaydi (ixtiyoriy kod ijrosi). Hisob `number`
 * ustida ketadi va bu yerda **ruxsat etilgan**: natija moliyaviy yozuv
 * emas (§12.4) va narx maydoniga o'tkazishda `roundMoney` bilan valyuta
 * qoidasiga keltiriladi. Pul yig'indilari esa har doim `contracts`
 * dagi `BigInt` funksiyalari bilan hisoblanadi.
 */
export function evaluateExpression(raw: string): number | null {
  const normalized = raw.replace(/[×хx]/gu, '*').replace(/[÷:]/gu, '/').replace(/,/gu, '.');
  const tokens = normalized.match(/\d+(?:\.\d+)?|[+\-*/]/gu);
  if (!tokens || tokens.join('') !== normalized.replace(/\s/gu, '')) return null;

  const values: number[] = [];
  const operators: string[] = [];

  for (const [index, token] of tokens.entries()) {
    if (index % 2 === 0) {
      const value = Number(token);
      if (!Number.isFinite(value)) return null;
      values.push(value);
      continue;
    }
    if (!'+-*/'.includes(token)) return null;
    operators.push(token);
  }
  if (values.length !== operators.length + 1) return null;

  // Avval ko'paytirish va bo'lish
  for (let index = 0; index < operators.length;) {
    const operator = operators[index];
    if (operator !== '*' && operator !== '/') {
      index += 1;
      continue;
    }
    const left = values[index] ?? 0;
    const right = values[index + 1] ?? 0;
    if (operator === '/' && right === 0) return null;
    values.splice(index, 2, operator === '*' ? left * right : left / right);
    operators.splice(index, 1);
  }

  let result = values[0] ?? 0;
  for (const [index, operator] of operators.entries()) {
    const right = values[index + 1] ?? 0;
    result = operator === '+' ? result + right : result - right;
  }

  return Number.isFinite(result) ? result : null;
}

function readHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((row): row is string => typeof row === 'string')
      : [];
  } catch {
    // Buzilgan yoki o'chirilgan xotira kalkulyatorni to'xtatmasin
    return [];
  }
}

function writeHistory(rows: string[]): void {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(rows.slice(0, HISTORY_LIMIT)));
  } catch {
    // Xotira to'lgan yoki taqiqlangan — hisob baribir ishlaydi
  }
}

type Mode = 'ARITHMETIC' | 'CONVERT';

export function Calculator({
  currency,
  storeRate,
  onUse,
  onClose,
}: {
  /** Natija o'tkaziladigan maydon valyutasi — yaxlitlash shunga qarab. */
  currency: Currency;
  /** Bugungi do'kon kursi (§12.1 — avtomatik, qo'lda o'zgartirish mumkin). */
  storeRate: string | null;
  onUse: (value: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>('ARITHMETIC');
  const [expression, setExpression] = useState('');
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState<Currency>(Currency.USD);
  const [rate, setRate] = useState(storeRate ?? '');
  const [history, setHistory] = useState<string[]>([]);

  // `localStorage` faqat brauzerda bor — server renderida o'qilmaydi
  useEffect(() => {
    setHistory(readHistory());
  }, []);

  useEffect(() => {
    if (storeRate !== null) setRate((current) => (current === '' ? storeRate : current));
  }, [storeRate]);

  const arithmeticResult = mode === 'ARITHMETIC' ? evaluateExpression(expression) : null;
  const convertResult = mode === 'CONVERT' ? convertWithRate(amount, from, rate) : null;
  const result = mode === 'ARITHMETIC' ? arithmeticResult : convertResult;
  const resultCurrency = mode === 'CONVERT' ? oppositeOf(from) : currency;
  const rounded = result === null ? null : roundMoney(String(result), resultCurrency);

  const remember = (line: string): void => {
    const next = [line, ...history.filter((row) => row !== line)].slice(0, HISTORY_LIMIT);
    setHistory(next);
    writeHistory(next);
  };

  return (
    <Card className="flex flex-col gap-3 border-action">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold">Kalkulyator</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Kalkulyatorni yopish"
          className="inline-flex size-11 items-center justify-center rounded-md text-text-secondary"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === 'ARITHMETIC' ? 'primary' : 'secondary'}
          onClick={() => {
            setMode('ARITHMETIC');
          }}
        >
          Amallar
        </Button>
        <Button
          type="button"
          variant={mode === 'CONVERT' ? 'primary' : 'secondary'}
          onClick={() => {
            setMode('CONVERT');
          }}
        >
          Valyuta
        </Button>
      </div>

      {mode === 'ARITHMETIC' ? (
        <Field label="Ifoda" htmlFor="calc-expression">
          <Input
            id="calc-expression"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Masalan: 12500000 * 2 - 500000"
            value={expression}
            onChange={(event) => {
              setExpression(event.target.value);
            }}
          />
        </Field>
      ) : (
        <div className="flex flex-wrap gap-3">
          <div className="min-w-32 flex-1">
            <Field label="Summa" htmlFor="calc-amount">
              <Input
                id="calc-amount"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                }}
              />
            </Field>
          </div>
          <div className="min-w-28 flex-1">
            <Field label="Valyuta" htmlFor="calc-from">
              <Select
                id="calc-from"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value as Currency);
                }}
              >
                <option value={Currency.USD}>USD → so‘m</option>
                <option value={Currency.UZS}>so‘m → USD</option>
              </Select>
            </Field>
          </div>
          <div className="min-w-32 flex-1">
            <Field label="Kurs" htmlFor="calc-rate">
              <Input
                id="calc-rate"
                inputMode="decimal"
                autoComplete="off"
                value={rate}
                onChange={(event) => {
                  setRate(event.target.value);
                }}
              />
            </Field>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="tabular m-0 text-lg font-semibold">
          {rounded === null ? '—' : formatMoney(rounded, resultCurrency)}
          {rounded !== null && (
            <span className="ml-1 text-sm font-normal text-text-secondary">
              {resultCurrency === Currency.USD ? 'USD' : 'so‘m'}
            </span>
          )}
        </p>

        <Button
          type="button"
          variant="primary"
          disabled={rounded === null}
          onClick={() => {
            if (rounded === null) return;
            remember(
              mode === 'ARITHMETIC'
                ? `${expression} = ${formatMoney(rounded, resultCurrency)}`
                : `${amount} ${from} × ${formatRate(rate)} = ${formatMoney(rounded, resultCurrency)}`,
            );
            // Natija boshqa valyutada bo'lsa ham maydon valyutasiga
            // keltiriladi: narx maydoni savdo valyutasida yuritiladi
            onUse(roundMoney(rounded, currency));
          }}
        >
          Narxga o‘tkazish
        </Button>
      </div>

      {history.length > 0 && (
        <details className="text-sm text-text-secondary">
          <summary className="min-h-11 cursor-pointer content-center">
            Oxirgi hisoblar ({history.length})
          </summary>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 pt-2">
            {history.map((row) => (
              <li key={row} className="tabular truncate">
                {row}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function oppositeOf(currency: Currency): Currency {
  return currency === Currency.USD ? Currency.UZS : Currency.USD;
}

/** §12.1 — USD ↔ UZS; kurs bo'sh yoki noto'g'ri bo'lsa natija yo'q. */
function convertWithRate(amount: string, from: Currency, rate: string): number | null {
  const value = Number(amount.replace(/,/gu, '.'));
  const rateValue = Number(rate.replace(/\s/gu, '').replace(/,/gu, '.'));
  if (!Number.isFinite(value) || !Number.isFinite(rateValue) || rateValue <= 0) return null;
  if (amount.trim() === '' || rate.trim() === '') return null;
  return from === Currency.USD ? value * rateValue : value / rateValue;
}
