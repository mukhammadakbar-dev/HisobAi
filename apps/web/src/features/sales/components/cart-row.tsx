'use client';

import { ProductType, convertMoney, multiplyMoney, sumMoney } from '@hisobai/contracts';
import type { Currency, ProductDto } from '@hisobai/contracts';
import { Calculator as CalculatorIcon, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Money } from '../../../components/money/money';
import { MoneyInput } from '../../../components/money/money-input';
import { Badge, Button, Field, Input, Select } from '../../../components/ui';
import { randomId } from '../../../lib/random-id';
import { useBatches, useInventoryItems } from '../../inventory/queries';
import { Calculator } from './calculator';

/**
 * Savat qatori (§7.11).
 *
 * Qator **aynan qaysi ombor birligi** sotilayotganini so'raydi: seriyalida
 * IMEI bo'yicha bitta telefon (§5.1), miqdorlida esa partiya (§5.2).
 * Sabab tannarxda: har birlikning va har partiyaning o'z tannarxi bor va
 * o'rtacha qiymat foydani yolg'on ko'rsatardi. Server tasdiqlashda
 * birlik ko'rsatilmagan qatorni rad etadi — u qoralamada qolishi mumkin,
 * lekin savdo bo'lolmaydi.
 *
 * §5.5 — qoralama ombor birligini **ushlab turmaydi**: shu birlik boshqa
 * qoralamada ham turishi mumkin va "birinchi tasdiqlagan oladi". Shuning
 * uchun ro'yxatda faqat `MAVJUD` birliklar ko'rsatiladi, lekin ularning
 * birortasi ham band deb belgilanmaydi.
 */

export interface CartRow {
  key: string;
  productId: string;
  inventoryItemId: string;
  batchId: string;
  quantity: string;
  unitPrice: string;
}

export function emptyCartRow(): CartRow {
  return {
    // Bu React ro'yxat kaliti, idempotency kaliti EMAS — hech qayerga
    // yuborilmaydi (`lib/random-id.ts`). `randomId()` LAN'dagi `http://`
    // da ham ishlaydi, `crypto.randomUUID` esa u yerda mavjud emas.
    key: randomId(),
    productId: '',
    inventoryItemId: '',
    batchId: '',
    quantity: '1',
    unitPrice: '',
  };
}

/** Ekrandagi jami uchun — `multiplyMoney` butun bo'lmagan miqdorda `TypeError` beradi. */
export function safeQuantity(raw: string): number {
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

export function lineTotal(row: CartRow, currency: Currency): string {
  return multiplyMoney(
    row.unitPrice === '' ? '0' : row.unitPrice,
    safeQuantity(row.quantity),
    currency,
  );
}

export function CartRowFields({
  row,
  index,
  products,
  currency,
  storeRate,
  canSeeCost,
  issues,
  removable,
  onChange,
  onRemove,
}: {
  row: CartRow;
  index: number;
  products: ProductDto[];
  /** Savdo valyutasi (§1.9) — narx va foyda shunda ko'rsatiladi. */
  currency: Currency;
  /** Bugungi do'kon kursi; tannarx boshqa valyutada bo'lsa kerak bo'ladi. */
  storeRate: string | null;
  canSeeCost: boolean;
  issues: Record<string, string>;
  removable: boolean;
  onChange: (patch: Partial<CartRow>) => void;
  onRemove: () => void;
}) {
  const [calculatorOpen, setCalculatorOpen] = useState(false);

  const product = products.find((candidate) => candidate.id === row.productId);
  const isSerialized = product?.type === ProductType.SERIALIZED;

  // Faqat tanlangan mahsulot bo'yicha so'raladi — butun ombor emas
  const items = useInventoryItems(
    { productId: row.productId, status: 'AVAILABLE' },
    row.productId !== '' && isSerialized,
  );
  const batches = useBatches(
    row.productId,
    row.productId !== '' && product !== undefined && !isSerialized,
  );

  const availableItems = row.productId === '' || !isSerialized ? [] : (items.data?.data ?? []);
  const availableBatches =
    row.productId === '' || isSerialized
      ? []
      : (batches.data?.data ?? []).filter((batch) => batch.quantityRemaining > 0);

  const selectedItem = availableItems.find((item) => item.id === row.inventoryItemId);
  const selectedBatch = availableBatches.find((batch) => batch.id === row.batchId);
  const cost = selectedItem
    ? { amount: selectedItem.costPrice, currency: selectedItem.costCurrency }
    : selectedBatch
      ? { amount: selectedBatch.unitCost, currency: selectedBatch.costCurrency }
      : null;

  // §7.9 — qator foydasi: sotuv − tannarx, savdo valyutasida. Kurs
  // qoralamada bugungi do'kon kursi; tasdiqlashda snapshot yoziladi (§1.7)
  const costInSaleCurrency =
    cost === null || (cost.currency !== currency && storeRate === null)
      ? null
      : convertMoney(cost.amount, cost.currency, currency, storeRate ?? '1');
  const quantity = safeQuantity(row.quantity);
  const profit =
    costInSaleCurrency === null
      ? null
      : sumMoney(
          [lineTotal(row, currency), `-${multiplyMoney(costInSaleCurrency, quantity, currency)}`],
          currency,
        );
  // §7.8 — tannarxdan past sotishda ogohlantiriladi, taqiqlanmaydi
  const belowCost = profit !== null && profit.startsWith('-');

  return (
    <fieldset className="m-0 flex flex-col gap-3 rounded-md border border-border-default p-3">
      <legend className="px-1 text-sm font-medium text-text-secondary">{index + 1}-qator</legend>

      <div className="flex flex-wrap gap-3">
        <div className="min-w-56 flex-2">
          <Field
            label="Mahsulot"
            htmlFor={`product-${row.key}`}
            error={issues[`items.${String(index)}.productId`]}
          >
            <Select
              id={`product-${row.key}`}
              value={row.productId}
              onChange={(event) => {
                const next = products.find((candidate) => candidate.id === event.target.value);
                // Mahsulot almashsa, oldingi birlik va partiya boshqa
                // mahsulotniki bo'lib qolardi — ikkalasi ham tozalanadi.
                // §4.3 — tavsiya narx maydonni oldindan to'ldiradi, lekin
                // qulflamaydi: chegirma maydoni yo'q, narx shu yerda
                // to'g'ridan-to'g'ri o'zgartiriladi (§7.3)
                onChange({
                  productId: event.target.value,
                  inventoryItemId: '',
                  batchId: '',
                  quantity: '1',
                  unitPrice: next?.suggestedPrice ?? '',
                });
              }}
            >
              <option value="">Tanlang</option>
              {products.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.displayName}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {product && isSerialized && (
          <div className="min-w-56 flex-2">
            <Field
              label="Ombor birligi (IMEI)"
              htmlFor={`item-${row.key}`}
              error={issues[`items.${String(index)}.inventoryItemId`]}
            >
              <Select
                id={`item-${row.key}`}
                value={row.inventoryItemId}
                onChange={(event) => {
                  onChange({ inventoryItemId: event.target.value, batchId: '', quantity: '1' });
                }}
              >
                <option value="">{items.isPending ? 'Yuklanmoqda…' : 'Tanlang'}</option>
                {availableItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {describeItem(item.imei1, item.serialNumber)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        {product && !isSerialized && (
          <>
            <div className="min-w-48 flex-1">
              <Field
                label="Partiya"
                htmlFor={`batch-${row.key}`}
                error={issues[`items.${String(index)}.batchId`]}
              >
                <Select
                  id={`batch-${row.key}`}
                  value={row.batchId}
                  onChange={(event) => {
                    onChange({ batchId: event.target.value, inventoryItemId: '' });
                  }}
                >
                  <option value="">{batches.isPending ? 'Yuklanmoqda…' : 'Tanlang'}</option>
                  {availableBatches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.quantityRemaining} dona qoldi
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="min-w-24 flex-1">
              <Field
                label="Miqdor"
                htmlFor={`quantity-${row.key}`}
                error={issues[`items.${String(index)}.quantity`]}
              >
                <Input
                  id={`quantity-${row.key}`}
                  type="number"
                  min={1}
                  max={selectedBatch?.quantityRemaining}
                  inputMode="numeric"
                  value={row.quantity}
                  onChange={(event) => {
                    onChange({ quantity: event.target.value });
                  }}
                />
              </Field>
            </div>
          </>
        )}
      </div>

      {product && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-44 flex-1">
            <Field
              label={`Sotuv narxi (${currency})`}
              htmlFor={`price-${row.key}`}
              error={issues[`items.${String(index)}.unitPrice`]}
            >
              <MoneyInput
                id={`price-${row.key}`}
                currency={currency}
                value={row.unitPrice}
                onChange={(value) => {
                  onChange({ unitPrice: value });
                }}
              />
            </Field>
          </div>

          {/* §12.6 — kalkulyator narx maydonining yonida */}
          <Button
            type="button"
            onClick={() => {
              setCalculatorOpen((open) => !open);
            }}
            aria-expanded={calculatorOpen}
          >
            <CalculatorIcon size={16} aria-hidden="true" className="mr-2" />
            Kalkulyator
          </Button>

          <div className="ml-auto text-right">
            <div className="text-sm text-text-secondary">Qator jami</div>
            <div className="text-lg font-semibold">
              <Money amount={lineTotal(row, currency)} currency={currency} />
            </div>
          </div>
        </div>
      )}

      {calculatorOpen && (
        <Calculator
          currency={currency}
          storeRate={storeRate}
          onUse={(value) => {
            onChange({ unitPrice: value });
            setCalculatorOpen(false);
          }}
          onClose={() => {
            setCalculatorOpen(false);
          }}
        />
      )}

      {/* §7.9 — har qatorning foydasi savatda ko'rinadi; `SELLER` da yashiriladi (P7) */}
      {canSeeCost && cost !== null && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          <span>
            Tannarx: <Money amount={cost.amount} currency={cost.currency} />
          </span>
          {profit !== null && (
            <span>
              · Foyda: <Money amount={profit} currency={currency} />
            </span>
          )}
          {belowCost && <Badge tone="warning">Tannarxdan past</Badge>}
        </div>
      )}

      {product && isSerialized && !items.isPending && availableItems.length === 0 && (
        <p className="m-0 text-sm text-warning" role="status">
          Bu mahsulotdan omborda sotuvga tayyor birlik yo‘q.
        </p>
      )}
      {product && !isSerialized && !batches.isPending && availableBatches.length === 0 && (
        <p className="m-0 text-sm text-warning" role="status">
          Bu mahsulotdan omborda qoldiq yo‘q.
        </p>
      )}

      {removable && (
        <div>
          <Button type="button" onClick={onRemove}>
            <Trash2 size={16} aria-hidden="true" className="mr-2" />
            Qatorni olib tashlash
          </Button>
        </div>
      )}
    </fieldset>
  );
}

/** IMEI yoki seriya raqami — ikkalasi ham bo'lmasa, birlik baribir tanlanadi. */
function describeItem(imei1: string | null, serialNumber: string | null): string {
  return imei1 ?? serialNumber ?? 'Identifikatorsiz birlik';
}
