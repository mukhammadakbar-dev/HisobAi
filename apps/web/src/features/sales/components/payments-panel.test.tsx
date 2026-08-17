import { Currency, convertMoney, formatMoneyWithCurrency } from '@hisobai/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { mockCashAccountUsd, mockCashAccountUzs } from '../../../test/msw/fixtures';
import { renderWithProviders } from '../../../test/render';
import { emptyPaymentRow, PaymentsPanel } from './payments-panel';
import type { PaymentRow } from './payments-panel';

/**
 * To'lov paneli — pul aniqligi (`FRONTEND.md` §13 "Majburiy").
 *
 * `PaymentsPanel` tarmoqqa chiqmaydi (to'liq boshqariluvchi — `rows`/
 * `onChange` props), shuning uchun MSW shart emas. Lekin ichkarida
 * server ishlatadigan **aynan o'sha** `@hisobai/contracts/money.ts`
 * funksiyalari chaqiriladi (`payments-panel.tsx` JSDoc: "server
 * tasdiqlashda aynan shu funksiyani ishlatadi, ya'ni ekrandagi qoldiq
 * bilan serverning tekshiruvi bir xil javob beradi"). Shu sabab bu
 * yerda kutilgan qiymatlar hardcode emas — o'sha funksiyalardan
 * hisoblanadi: ikkalasi ikki xil formula ishlatib qo'ysa (bittasi to'g'ri,
 * bittasi noto'g'ri bo'lsa ham) test farqni sezmay qolardi.
 *
 * Kichik `Harness` — panelni xuddi `SaleForm` qanday ishlatsa (holatni
 * o'zi ushlab, `onChange` bilan yangilab) shunday ishlatadi; testda
 * implementatsiya emas, ekranda ko'ringan xatti-harakat tekshiriladi
 * (`getByLabelText` + `user-event`).
 */

function Harness({
  currency,
  total,
  storeRate = null,
}: {
  currency: Currency;
  total: string;
  storeRate?: string | null;
}) {
  const [rows, setRows] = useState<PaymentRow[]>([emptyPaymentRow()]);
  return (
    <PaymentsPanel
      rows={rows}
      accounts={[mockCashAccountUzs, mockCashAccountUsd]}
      currency={currency}
      storeRate={storeRate}
      total={total}
      issues={{}}
      onChange={setRows}
    />
  );
}

/** "Qoldi: <summa>" qatorining to'liq matni. */
function remainingText(): string {
  return screen.getByText('Qoldi:').parentElement?.textContent ?? '';
}

describe('PaymentsPanel — pul aniqligi (§17.10, §1.10)', () => {
  it('aralash to‘lovda (bir necha qator) "qoldi" hisobi to‘g‘ri (§17.10)', async () => {
    const user = userEvent.setup();
    // 1 000 000 + 500 000 = 1 500 000 — ikki qator yig'indisi savdo
    // summasiga AYNAN teng bo'lishi kerak (§17.10 — naqd savdo to'liq to'lanadi)
    renderWithProviders(<Harness currency={Currency.UZS} total="1500000" />);

    await user.selectOptions(screen.getByLabelText('Kassa hisobi'), mockCashAccountUzs.id);
    await user.type(screen.getByLabelText('Summa (UZS)'), '1000000');

    // Hali to'liq to'lanmagan — "Qoldi" ogohlantirish rangida ko'rinadi
    expect(remainingText()).toContain(formatMoneyWithCurrency('500000', Currency.UZS));

    await user.click(screen.getByRole('button', { name: /Yana to.lov/u }));
    const accountSelects = screen.getAllByLabelText('Kassa hisobi');
    await user.selectOptions(accountSelects[1]!, mockCashAccountUzs.id);
    const amountInputs = screen.getAllByLabelText('Summa (UZS)');
    await user.type(amountInputs[1]!, '500000');

    expect(remainingText()).toContain(formatMoneyWithCurrency('0', Currency.UZS));
  });

  it('boshqa valyutadagi to‘lov kurs bilan to‘g‘ri aylantiriladi, qoldiq aynan nolga tushadi', async () => {
    const user = userEvent.setup();
    const storeRate = '12700';
    // 10 USD × 12 700 = 127 000 UZS — qoldiqsiz bo'linadi (yaxlitlash
    // xatosi bo'lsa ham shu yerda ko'rinmasdi, shuning uchun aslida
    // "to'g'ri kelmoqda" degan yolg'on tuyg'u berardi — sinov shart emas,
    // ammo `convertMoney`dan hisoblangani uchun natija baribir aniq)
    const total = convertMoney('10', Currency.USD, Currency.UZS, storeRate);
    renderWithProviders(<Harness currency={Currency.UZS} total={total} storeRate={storeRate} />);

    await user.selectOptions(screen.getByLabelText('Kassa hisobi'), mockCashAccountUsd.id);
    await user.type(screen.getByLabelText('Summa (USD)'), '10');

    const converted = convertMoney('10', Currency.USD, Currency.UZS, storeRate);
    expect(screen.getByText(/Savdo valyutasida/).parentElement).toHaveTextContent(
      formatMoneyWithCurrency(converted, Currency.UZS),
    );
    expect(remainingText()).toContain(formatMoneyWithCurrency('0', Currency.UZS));
  });

  it('UZS to‘lovda kasr qismi umuman qabul qilinmaydi (§1.10)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness currency={Currency.UZS} total="0" />);

    const input = screen.getByLabelText('Summa (UZS)') as HTMLInputElement;
    // Nuqtani ham, keyingi ikkita raqamni ham kiritishga urinamiz —
    // nuqta e'tiborsiz qoldirilishi, raqamlar esa butun qismga
    // QO'SHILISHI kerak (tiyin sifatida emas)
    await user.type(input, '1000.50');

    expect(input.value).not.toMatch(/\./u);
    expect(input.value.replace(/\s/gu, '')).toBe('100050');
  });

  it('USD to‘lovda eng ko‘pi 2 kasr xonagacha yaxlitlanadi (§1.10)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness currency={Currency.USD} total="0" />);

    const input = screen.getByLabelText('Summa (USD)') as HTMLInputElement;
    await user.type(input, '10.567');
    // Yozish paytida kasr xonalar cheklanmaydi (§6.2 — "fokus ketganda
    // valyuta qoidasiga yaxlitlanadi"), shuning uchun aynan fokusdan
    // chiqish tekshiriladi
    await user.tab();

    expect(input).toHaveValue('10.57');
  });
});
