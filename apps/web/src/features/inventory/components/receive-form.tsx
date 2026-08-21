'use client';

import {
  MAX_RECEIVE_ROWS,
  ProductType,
  multiplyMoney,
  receiveSchema,
  sumMoney,
} from '@hisobai/contracts';
import type {
  Currency,
  DuplicateIdentifierRow,
  ProductDto,
  ReceiveInput,
  ReceiveResultDto,
} from '@hisobai/contracts';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Money } from '../../../components/money/money';
import { MoneyInput } from '../../../components/money/money-input';
import { ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Button, Card, Field, Input, Select } from '../../../components/ui';
import { ApiError } from '../../../lib/api-error';
import { INVENTORY_STATUS_LABEL } from '../../../lib/labels';
import { errorMessage } from '../../../lib/messages';
import { useProducts } from '../../catalog/queries';
import { useReceiveInventory } from '../queries';
import { randomUuid } from '../../../lib/uuid';

/**
 * Qabul qilish formasi (§5.11).
 *
 * Uch qaror shu yerda ko'rinadi:
 *
 *  1. **Forma turi mahsulotdan kelib chiqadi.** Seriyalida har birlik
 *     o'z qatori (§5.1), miqdorlida bitta partiya (§5.2). Foydalanuvchi
 *     turni tanlamaydi — u allaqachon shablonda yozilgan.
 *  2. **`Idempotency-Key` forma ochilganda yaratiladi** (`API.md` §4.2)
 *     va muvaffaqiyatdan keyin yangilanadi. Tugma ikki marta bosilsa
 *     yoki javob yo'qolib qayta yuborilsa — ikkinchi qabul bo'lmaydi.
 *  3. **Dublikat IMEI aynan o'z qatoriga bog'lanadi** (§3.3): server
 *     `details.rows` da qator raqamini qaytaradi. Umumiy banner bilan
 *     cheklansak, 50 qatorli formada qaysi biri ekanini topib
 *     bo'lmasdi.
 */

interface ItemRow {
  imei1: string;
  imei2: string;
  serialNumber: string;
  costPrice: string;
  note: string;
}

function emptyRow(costPrice = ''): ItemRow {
  return { imei1: '', imei2: '', serialNumber: '', costPrice, note: '' };
}

const blank = (value: string): string | undefined =>
  value.trim() === '' ? undefined : value.trim();

/**
 * Ekrandagi "jami" uchun miqdor.
 *
 * `multiplyMoney` butun bo'lmagan ko'paytuvchida `TypeError` tashlaydi
 * (`money.ts` — partiyada yarim dona bo'lmaydi). `<input type="number">`
 * esa "1.5" yozishga to'sqinlik qilmaydi, ya'ni to'g'ridan-to'g'ri
 * uzatilsa render paytida butun sahifa qulardi. Yaroqsiz kiritishda
 * jami nol ko'rsatiladi; haqiqiy xatoni yuborishda sxema beradi.
 */
function quantityForTotal(raw: string): number {
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

/** `details.rows` → forma maydonlari kaliti (`items.0.imei1`). */
function duplicateIssues(rows: DuplicateIdentifierRow[]): Record<string, string> {
  const issues: Record<string, string> = {};
  for (const row of rows) {
    const status = INVENTORY_STATUS_LABEL[row.existingStatus] ?? row.existingStatus;
    issues[`items.${String(row.index)}.${row.field}`] =
      `Bu identifikator bazada bor (holati: ${status.toLowerCase()}).`;
  }
  return issues;
}

function serverIssues(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};

  const rows = error.details?.rows;
  if (Array.isArray(rows)) return duplicateIssues(rows as DuplicateIdentifierRow[]);

  const issues: Record<string, string> = {};
  for (const issue of error.issues) issues[issue.field] = issue.message;
  return issues;
}

export function ReceiveForm({ initialProductId }: { initialProductId?: string }) {
  const products = useProducts({ isActive: 'active', limit: 200 });
  const receive = useReceiveInventory();

  const [productId, setProductId] = useState(initialProductId ?? '');
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()]);
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [note, setNote] = useState('');
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ReceiveResultDto | null>(null);
  // `API.md` §4.2 — kalit forma ochilganda yaratiladi, qayta yuborishda o'zgarmaydi
  const [idempotencyKey, setIdempotencyKey] = useState(() => randomUuid());

  const product = products.data?.data.find((candidate) => candidate.id === productId);
  const currency: Currency = product?.currency ?? 'UZS';
  const isSerialized = product?.type === ProductType.SERIALIZED;

  /** §4.2 — oxirgi tannarx formani oldindan to'ldiradi. */
  useEffect(() => {
    if (!product?.lastCostPrice) return;
    setRows((current) =>
      current.every((row) => row.costPrice === '')
        ? current.map((row) => ({ ...row, costPrice: product.lastCostPrice ?? '' }))
        : current,
    );
    setUnitCost((current) => (current === '' ? (product.lastCostPrice ?? '') : current));
  }, [product]);

  const totalCost = isSerialized
    ? sumMoney(
        rows.map((row) => (row.costPrice === '' ? '0' : row.costPrice)),
        currency,
      )
    : multiplyMoney(unitCost === '' ? '0' : unitCost, quantityForTotal(quantity), currency);

  const buildPayload = (): ReceiveInput =>
    ({
      productId,
      costCurrency: currency,
      note: blank(note) ?? null,
      ...(isSerialized
        ? {
            items: rows.map((row) => ({
              imei1: blank(row.imei1) ?? null,
              imei2: blank(row.imei2) ?? null,
              serialNumber: blank(row.serialNumber) ?? null,
              costPrice: row.costPrice,
              note: blank(row.note) ?? null,
            })),
          }
        : {
            batch: {
              quantityReceived: Number(quantity),
              unitCost,
              note: null,
            },
          }),
    }) as ReceiveInput;

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    setResult(null);

    const payload = buildPayload();
    /**
     * Serverga yuborishdan oldin **o'sha sxema** bilan tekshiriladi
     * (`FRONTEND.md` §6.1): foydalanuvchi 50 qatorni to'ldirib bo'lib,
     * so'rovdan keyin xato ko'rmasin.
     */
    const parsed = receiveSchema.safeParse(payload);
    if (!parsed.success) {
      const found: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        found[issue.path.map(String).join('.')] = issue.message;
      }
      setIssues(found);
      return;
    }

    setIssues({});
    receive.mutate(
      { input: parsed.data, idempotencyKey },
      {
        onSuccess: (received) => {
          setResult(received);
          setRows([emptyRow()]);
          setQuantity('1');
          setNote('');
          // Yangi qabul — yangi kalit; aks holda ikkinchi qabul
          // birinchisining saqlangan javobini olardi
          setIdempotencyKey(randomUuid());
        },
        onError: (error) => {
          setIssues(serverIssues(error));
        },
      },
    );
  };

  if (products.isPending) {
    return (
      <Card>
        <TableSkeleton rows={4} />
      </Card>
    );
  }

  if (products.isError) {
    return (
      <ErrorState
        error={products.error}
        onRetry={() => {
          void products.refetch();
        }}
      />
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {result && <ReceiveSummary result={result} />}

      {receive.isError && Object.keys(issues).length === 0 && (
        <p
          className="m-0 rounded-md bg-danger-bg px-3 py-2 text-sm font-medium text-danger"
          role="alert"
        >
          {errorMessage(receive.error)}
        </p>
      )}
      {receive.isError && Object.keys(issues).length > 0 && (
        <p
          className="m-0 rounded-md bg-danger-bg px-3 py-2 text-sm font-medium text-danger"
          role="alert"
        >
          {errorMessage(receive.error)} Belgilangan qatorlarni tuzating.
        </p>
      )}

      <Card className="flex flex-col gap-4">
        <Field label="Mahsulot" htmlFor="productId" error={issues.productId}>
          <Select
            id="productId"
            value={productId}
            onChange={(event) => {
              setProductId(event.target.value);
              setIssues({});
              setResult(null);
            }}
          >
            <option value="">Tanlang</option>
            {(products.data?.data ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.displayName}
              </option>
            ))}
          </Select>
        </Field>

        {product && <ProductHint product={product} />}

        {/*
          Ro'yxat birinchi 200 faol mahsulot bilan cheklangan (`limit`).
          Havoladan kelgan `productId` o'sha sahifaga tushmasa yoki
          mahsulot arxivlangan bo'lsa, forma jimgina bo'sh qolardi.
        */}
        {productId !== '' && !product && (
          <p className="m-0 text-sm text-danger" role="alert">
            Bu mahsulot ro‘yxatda yo‘q — u arxivda bo‘lishi mumkin. Ro‘yxatdan boshqasini tanlang.
          </p>
        )}

        <Field label="Izoh (ixtiyoriy)" htmlFor="note" error={issues.note}>
          <Input
            id="note"
            value={note}
            placeholder="Masalan: yetkazib beruvchi yoki hujjat raqami"
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        </Field>
      </Card>

      {product && isSerialized && (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-lg font-semibold">Birliklar</h2>
            <span className="text-sm text-text-tertiary">
              {rows.length} / {MAX_RECEIVE_ROWS}
            </span>
          </div>

          {issues.items && (
            <p className="m-0 text-sm text-danger" role="alert">
              {issues.items}
            </p>
          )}

          {rows.map((row, index) => (
            <fieldset
              key={index}
              className="m-0 flex flex-col gap-3 rounded-md border border-border-default p-3"
            >
              <legend className="px-1 text-sm font-medium text-text-secondary">
                {index + 1}-birlik
              </legend>

              <div className="flex flex-wrap gap-3">
                <div className="min-w-44 flex-1">
                  <Field
                    label="IMEI-1"
                    htmlFor={`imei1-${String(index)}`}
                    error={issues[`items.${String(index)}.imei1`]}
                  >
                    <Input
                      id={`imei1-${String(index)}`}
                      inputMode="numeric"
                      autoComplete="off"
                      value={row.imei1}
                      onChange={(event) => {
                        updateRow(setRows, index, { imei1: event.target.value });
                      }}
                    />
                  </Field>
                </div>
                <div className="min-w-44 flex-1">
                  <Field
                    label="IMEI-2 (ixtiyoriy)"
                    htmlFor={`imei2-${String(index)}`}
                    error={issues[`items.${String(index)}.imei2`]}
                  >
                    <Input
                      id={`imei2-${String(index)}`}
                      inputMode="numeric"
                      autoComplete="off"
                      value={row.imei2}
                      onChange={(event) => {
                        updateRow(setRows, index, { imei2: event.target.value });
                      }}
                    />
                  </Field>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="min-w-44 flex-1">
                  <Field
                    label="Seriya raqami"
                    htmlFor={`serial-${String(index)}`}
                    error={issues[`items.${String(index)}.serialNumber`]}
                  >
                    <Input
                      id={`serial-${String(index)}`}
                      autoComplete="off"
                      value={row.serialNumber}
                      onChange={(event) => {
                        updateRow(setRows, index, { serialNumber: event.target.value });
                      }}
                    />
                  </Field>
                </div>
                <div className="min-w-44 flex-1">
                  <Field
                    label={`Tannarx (${currency})`}
                    htmlFor={`cost-${String(index)}`}
                    error={issues[`items.${String(index)}.costPrice`]}
                  >
                    <MoneyInput
                      id={`cost-${String(index)}`}
                      currency={currency}
                      value={row.costPrice}
                      onChange={(value) => {
                        updateRow(setRows, index, { costPrice: value });
                      }}
                    />
                  </Field>
                </div>
              </div>

              {rows.length > 1 && (
                <div>
                  <Button
                    type="button"
                    onClick={() => {
                      setRows((current) => current.filter((_, position) => position !== index));
                      setIssues({});
                    }}
                  >
                    <Trash2 size={16} aria-hidden="true" className="mr-2" />
                    Qatorni olib tashlash
                  </Button>
                </div>
              )}
            </fieldset>
          ))}

          <div>
            <Button
              type="button"
              disabled={rows.length >= MAX_RECEIVE_ROWS}
              onClick={() => {
                // Oldingi qatordagi tannarx odatda bir xil — takror kiritilmasin
                setRows((current) => [...current, emptyRow(current.at(-1)?.costPrice ?? '')]);
              }}
            >
              <Plus size={16} aria-hidden="true" className="mr-2" />
              Yana bitta
            </Button>
          </div>
        </Card>
      )}

      {product && !isSerialized && (
        <Card className="flex flex-col gap-4">
          <h2 className="m-0 text-lg font-semibold">Partiya</h2>

          <div className="flex flex-wrap gap-3">
            <div className="min-w-44 flex-1">
              <Field label="Miqdor" htmlFor="quantity" error={issues['batch.quantityReceived']}>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={quantity}
                  onChange={(event) => {
                    setQuantity(event.target.value);
                  }}
                />
              </Field>
            </div>
            <div className="min-w-44 flex-1">
              <Field
                label={`Donasiga tannarx (${currency})`}
                htmlFor="unitCost"
                error={issues['batch.unitCost']}
              >
                <MoneyInput
                  id="unitCost"
                  currency={currency}
                  value={unitCost}
                  onChange={setUnitCost}
                />
              </Field>
            </div>
          </div>
        </Card>
      )}

      {product && (
        <Card className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm text-text-secondary">Jami tannarx</div>
            <div className="text-xl font-semibold">
              <Money amount={totalCost} currency={currency} />
            </div>
          </div>

          <Button type="submit" variant="primary" disabled={receive.isPending}>
            {receive.isPending ? 'Yozilmoqda…' : 'Qabul qilish'}
          </Button>
        </Card>
      )}
    </form>
  );
}

function updateRow(
  setRows: React.Dispatch<React.SetStateAction<ItemRow[]>>,
  index: number,
  patch: Partial<ItemRow>,
): void {
  setRows((current) =>
    current.map((row, position) => (position === index ? { ...row, ...patch } : row)),
  );
}

function ProductHint({ product }: { product: ProductDto }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
      <Badge tone="info">{product.type === ProductType.SERIALIZED ? 'Seriyali' : 'Miqdorli'}</Badge>
      <span>Valyuta: {product.currency}</span>
      <span>· Qoldiq: {product.stock.available}</span>
      {product.lastCostPrice && (
        <span>
          · Oxirgi tannarx: <Money amount={product.lastCostPrice} currency={product.currency} />
        </span>
      )}
    </div>
  );
}

function ReceiveSummary({ result }: { result: ReceiveResultDto }) {
  return (
    <div
      role="status"
      className="flex flex-col gap-1 rounded-md bg-success-bg px-3 py-2 text-sm text-success"
    >
      <span className="font-medium">
        {result.totalQuantity} ta birlik qabul qilindi ·{' '}
        <Money amount={result.totalCost} currency={result.currency} />
      </span>
      <span className="text-text-secondary">
        Ombor va katalogdagi qoldiq yangilandi. Yangi qabulni shu formadan davom ettirsangiz
        bo‘ladi.
      </span>
    </div>
  );
}
