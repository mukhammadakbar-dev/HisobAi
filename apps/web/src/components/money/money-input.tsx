'use client';

import { roundMoney, scaleOf } from '@hisobai/contracts';
import type { Currency } from '@hisobai/contracts';
import { useEffect, useState } from 'react';

import { Input } from '../ui';

/**
 * Pul kiritish maydoni (`FRONTEND.md` §6.2).
 *
 * To'rtta qoida shu komponentda majburlanadi:
 *
 *  1. Qiymat **string** bo'lib kiradi va string bo'lib chiqadi —
 *     `number` ga aylantirilmaydi (ARCHITECTURE §4);
 *  2. kiritish paytida minglik ajratgich qo'yiladi, lekin `onChange` ga
 *     **toza** qiymat uzatiladi;
 *  3. fokus ketganda `roundMoney` bilan valyuta qoidasiga keltiriladi
 *     (§1.10) — yaxlitlash yozishdan oldin bo'lishi kerak, serverdan
 *     "12000000.6 → 12000001" bo'lib qaytishi kutilmagan hol bo'lardi;
 *  4. UZS'da kasr qismi umuman qabul qilinmaydi (tiyin ishlatilmaydi).
 */

/** `money.ts` dagi bilan bir xil — uzilmaydigan probel. */
const THOUSANDS_SEPARATOR = ' ';

/** Ko'rinishdagi ajratgichlarni olib tashlaydi. */
function canonical(text: string): string {
  return text.replace(/\s/gu, '');
}

function group(value: string): string {
  if (value === '') return '';
  const [whole = '', fraction] = value.split('.');

  let grouped = '';
  for (let index = whole.length; index > 0; index -= 3) {
    const start = Math.max(0, index - 3);
    grouped = whole.slice(start, index) + (grouped ? THOUSANDS_SEPARATOR + grouped : '');
  }

  // Kasr qismi "12." holatida ham saqlanadi — foydalanuvchi yozishda davom etadi
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/**
 * Kiritilgan matnni tozalaydi: faqat raqamlar va (agar valyuta ruxsat
 * bersa) bitta nuqta. Vergul nuqtaga aylantiriladi — telefon
 * klaviaturasida ko'pincha aynan vergul chiqadi.
 */
function sanitize(raw: string, currency: Currency): string {
  const allowFraction = scaleOf(currency) > 0;
  const cleaned = canonical(raw).replace(/,/gu, '.');

  let result = '';
  let seenDot = false;
  for (const char of cleaned) {
    if (char >= '0' && char <= '9') {
      result += char;
      continue;
    }
    if (char === '.' && allowFraction && !seenDot && result !== '') {
      result += char;
      seenDot = true;
    }
  }
  return result;
}

export function MoneyInput({
  id,
  value,
  currency,
  onChange,
  placeholder,
  'aria-describedby': describedBy,
}: {
  id: string;
  /** Kanonik qiymat: `"12000000.5"`. Bo'sh satr — kiritilmagan. */
  value: string;
  currency: Currency;
  onChange: (value: string) => void;
  placeholder?: string;
  'aria-describedby'?: string;
}) {
  const [text, setText] = useState(() => group(value));

  /**
   * Tashqi qiymat o'zgarganda ko'rinish yangilanadi (forma `reset`
   * qilinganda yoki valyuta almashganda). Solishtiruv **kanonik**
   * shaklda: aks holda har bosishda ajratgichlar qayta hisoblanib,
   * kursor sakrab ketardi.
   */
  useEffect(() => {
    setText((current) => (canonical(current) === value ? current : group(value)));
  }, [value]);

  return (
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      aria-describedby={describedBy}
      value={text}
      onChange={(event) => {
        const next = sanitize(event.target.value, currency);
        setText(group(next));
        onChange(next);
      }}
      onBlur={() => {
        if (value === '') return;
        const rounded = roundMoney(value, currency);
        setText(group(rounded));
        onChange(rounded);
      }}
      className="tabular"
    />
  );
}
