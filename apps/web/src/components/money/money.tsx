import { formatMoney, formatMoneyWithCurrency } from '@hisobai/contracts';
import type { Currency, MoneyInput } from '@hisobai/contracts';

/**
 * Pul ko'rsatish (`design.md` §4, `FRONTEND.md` §1).
 *
 * Ikki qoida shu komponentda majburlanadi, chunki ularni har joyda
 * eslab yurish ishonchsiz:
 *  - `tabular-nums` — raqamlar ustunlarda tik turadi;
 *  - qiymat **string** bo'lib keladi va string bo'lib qoladi — hech qanday
 *    `number` arifmetikasi yo'q (ARCHITECTURE §4).
 */
export function Money({
  amount,
  currency,
  withCurrency = true,
  className = '',
}: {
  amount: MoneyInput | null | undefined;
  currency: Currency;
  /** `false` — jadval ustunlarida valyuta sarlavhada bo'lganda. */
  withCurrency?: boolean;
  className?: string;
}) {
  if (amount === null || amount === undefined) {
    return <span className={`tabular text-text-tertiary ${className}`}>—</span>;
  }

  const text = withCurrency
    ? formatMoneyWithCurrency(amount, currency)
    : formatMoney(amount, currency);

  return <span className={`tabular ${className}`}>{text}</span>;
}
