'use client';

import {
  ReversalKind,
  ReversalReason,
  SaleStatus,
  multiplyMoney,
  sumMoney,
} from '@hisobai/contracts';
import type { SaleDto } from '@hisobai/contracts';
import { useMemo, useState } from 'react';

import { Money } from '../../../components/money/money';
import { Button, Card, Field, Input, Select } from '../../../components/ui';
import { FormError } from '../../auth/components/form-error';
import { REVERSAL_REASON_LABEL } from '../../../lib/labels';
import { useCancelSale, useReturnSale } from '../queries';
import { randomUuid } from '../../../lib/uuid';

/**
 * Qaytarish va bekor qilish paneli (§8, §16.5).
 *
 * **Modal emas, kartaning ichida ochiladigan panel** — loyihadagi
 * boshqa amallar bilan bir xil (`payments-panel.tsx`). Sabab telefonda:
 * qaytarishda foydalanuvchi qatorlarni tanlab, miqdorni kiritadi va
 * shu payt yuqoridagi jadvalga qarab turadi. Modal uni to'sib qo'yardi
 * va u nima qaytarayotganini eslab turishga majbur bo'lardi.
 *
 * Ikkala amal bitta komponentda, chunki foydalanuvchi ular orasidan
 * TANLAYDI — va bu tanlov ekranda ko'rinib turishi kerak. Ikki alohida
 * tugma ikki alohida ekranga olib borsa, "qaysi birini bosishim
 * kerak edi" degan savol javobsiz qolardi; bu yerda esa har birining
 * ostida nima farqi borligi yozib qo'yilgan.
 *
 * `Idempotency-Key` panel ochilganda **bir marta** yaratiladi
 * (`API.md` §4.2): har bosishda yangisi olinsa, aynan himoya qilinishi
 * kerak bo'lgan holat — javob yo'qolib, ega tugmani qayta bosishi —
 * himoyasiz qolardi va ombor qoldig'i ikki barobar oshib ketardi.
 */
export function ReversalPanel({ sale }: { sale: SaleDto }) {
  const [mode, setMode] = useState<ReversalKind | null>(null);

  // §8, §16.5 — faqat tasdiqlangan yoki qisman qaytarilgan savdo
  const canReverse =
    sale.status === SaleStatus.CONFIRMED || sale.status === SaleStatus.PARTIALLY_RETURNED;

  if (!canReverse) return null;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-lg font-semibold">Tuzatish</h2>
        <p className="m-0 text-sm text-text-secondary">
          Tasdiqlangan savdo o‘zgartirilmaydi va o‘chirilmaydi — ustiga teskari yozuv qo‘shiladi
          (§17.4).
        </p>
      </div>

      {mode === null ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <ActionChoice
            title="Qaytarish"
            description="Mahsulot haqiqatan qaytib keldi. Hisobotda savdo ham, qaytarish ham ko‘rinadi."
            onClick={() => {
              setMode(ReversalKind.RETURN);
            }}
          />
          {/* §16.5 — qisman qaytarilgan savdo bekor qilinmaydi: mahsulot
              allaqachon qaytgani qayd etilgan, ya'ni "hech narsa
              bo'lmagan" degani rost emas */}
          {sale.status === SaleStatus.CONFIRMED && (
            <ActionChoice
              title="Bekor qilish"
              description="Savdo xato kiritilgan, jismonan hech narsa bo‘lmagan. Faqat oxirgi 7 kun ichida."
              onClick={() => {
                setMode(ReversalKind.CANCEL);
              }}
            />
          )}
        </div>
      ) : mode === ReversalKind.RETURN ? (
        <ReturnForm
          sale={sale}
          onClose={() => {
            setMode(null);
          }}
        />
      ) : (
        <CancelForm
          sale={sale}
          onClose={() => {
            setMode(null);
          }}
        />
      )}
    </Card>
  );
}

function ActionChoice({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 flex-1 flex-col gap-1 rounded-md border border-border-default p-3 text-left hover:border-border-strong"
    >
      <span className="font-semibold">{title}</span>
      <span className="text-sm text-text-secondary">{description}</span>
    </button>
  );
}

/**
 * §8.4 — qisman qaytarish: qatorlar tanlanadi, miqdorli mahsulotda
 * miqdor ham. Allaqachon qaytarilgan miqdor qolganidan ayriladi, ya'ni
 * bitta telefonni ikki marta qaytarib bo'lmaydi.
 */
function ReturnForm({ sale, onClose }: { sale: SaleDto; onClose: () => void }) {
  const returnSale = useReturnSale(sale.id);
  const idempotencyKey = useMemo(() => randomUuid(), []);

  const returnable = sale.items
    .map((item) => ({ item, remaining: item.quantity - item.returnedQuantity }))
    .filter((row) => row.remaining > 0);

  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(returnable.map((row) => [row.item.id, 0])),
  );
  const [reason, setReason] = useState<ReversalReason>(ReversalReason.DEFECTIVE);
  const [note, setNote] = useState('');

  const selected = returnable
    .map((row) => ({ ...row, quantity: quantities[row.item.id] ?? 0 }))
    .filter((row) => row.quantity > 0);

  // `sumMoney` — server ham aynan shu funksiyani ishlatadi, ya'ni
  // ekrandagi summa serverning yozadigan summasiga teng bo'ladi
  // (`FRONTEND.md` §6.1). Qo'lda `Number(...)` bilan qo'shish suzuvchi
  // nuqta xatosini kiritardi
  const total = sumMoney(
    selected.map((row) => multiplyMoney(row.item.unitPrice, row.quantity, sale.currency)),
    sale.currency,
  );

  // §8.6 — "boshqa" sababda izoh majburiy: oradan bir oy o'tib
  // "Boshqa" degan yozuv hech narsani tushuntirmaydi
  const noteRequired = reason === ReversalReason.OTHER && note.trim() === '';
  const disabled = selected.length === 0 || noteRequired || returnSale.isPending;

  const onSubmit = (): void => {
    returnSale.mutate(
      {
        idempotencyKey,
        input: {
          items: selected.map((row) => ({ saleItemId: row.item.id, quantity: row.quantity })),
          reason,
          note: note.trim() === '' ? null : note.trim(),
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <FormError error={returnSale.error} />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Qaytariladigan qatorlar</span>
        {returnable.map((row) => (
          <div
            key={row.item.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-default p-3"
          >
            <div className="flex flex-col">
              <span className="font-medium">{row.item.productName}</span>
              <span className="text-sm text-text-secondary">
                Qaytarish mumkin: {row.remaining} dona ·{' '}
                <Money amount={row.item.unitPrice} currency={sale.currency} />
              </span>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-text-secondary">Miqdor</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={row.remaining}
                value={String(quantities[row.item.id] ?? 0)}
                onChange={(event) => {
                  const raw = Number.parseInt(event.target.value, 10);
                  const next = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), row.remaining) : 0;
                  setQuantities((current) => ({ ...current, [row.item.id]: next }));
                }}
                className="w-24"
              />
            </label>
          </div>
        ))}
      </div>

      <ReasonFields
        reason={reason}
        note={note}
        onReason={setReason}
        onNote={setNote}
        noteRequired={noteRequired}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default pt-3">
        <div>
          <div className="text-sm text-text-secondary">Qaytariladigan summa</div>
          <div className="text-lg font-semibold">
            <Money amount={total} currency={sale.currency} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="button" variant="primary" disabled={disabled} onClick={onSubmit}>
            {returnSale.isPending ? 'Yuborilmoqda…' : 'Qaytarishni rasmiylashtirish'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * §16.5 — bekor qilishda qator tanlanmaydi: "savdo umuman bo'lmagandek"
 * degani hammasi yoki hech narsa. Shuning uchun bu yerda faqat sabab
 * so'raladi va nima bo'lishi aniq yozib qo'yiladi.
 */
function CancelForm({ sale, onClose }: { sale: SaleDto; onClose: () => void }) {
  const cancelSale = useCancelSale(sale.id);
  const idempotencyKey = useMemo(() => randomUuid(), []);

  const [reason, setReason] = useState<ReversalReason>(ReversalReason.ENTRY_ERROR);
  const [note, setNote] = useState('');

  const noteRequired = reason === ReversalReason.OTHER && note.trim() === '';

  const onSubmit = (): void => {
    cancelSale.mutate(
      {
        idempotencyKey,
        input: { reason, note: note.trim() === '' ? null : note.trim() },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <FormError error={cancelSale.error} />

      <p className="m-0 rounded-md bg-warning-bg p-3 text-sm text-warning">
        Savdo <strong>asl sanasiga</strong> bekor qilinadi (§16.5): o‘sha kunning aylanmasi va kassa
        qoldig‘i o‘zgaradi. Mahsulot omborga <strong>“mavjud”</strong> holida qaytadi, pul esa
        to‘lov tushgan hisobdan chiqadi.
      </p>

      <ReasonFields
        reason={reason}
        note={note}
        onReason={setReason}
        onNote={setNote}
        noteRequired={noteRequired}
      />

      <div className="flex justify-end gap-2 border-t border-border-default pt-3">
        <Button type="button" variant="secondary" onClick={onClose}>
          Yopish
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={noteRequired || cancelSale.isPending}
          onClick={onSubmit}
        >
          {cancelSale.isPending ? 'Yuborilmoqda…' : 'Savdoni bekor qilish'}
        </Button>
      </div>
    </div>
  );
}

function ReasonFields({
  reason,
  note,
  onReason,
  onNote,
  noteRequired,
}: {
  reason: ReversalReason;
  note: string;
  onReason: (value: ReversalReason) => void;
  onNote: (value: string) => void;
  noteRequired: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Sabab (§8.6)" htmlFor="reversal-reason">
        <Select
          id="reversal-reason"
          value={reason}
          onChange={(event) => {
            onReason(event.target.value as ReversalReason);
          }}
        >
          {Object.values(ReversalReason).map((value) => (
            <option key={value} value={value}>
              {REVERSAL_REASON_LABEL[value] ?? value}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Izoh"
        htmlFor="reversal-note"
        error={noteRequired ? '“Boshqa” sababda izoh yozing' : undefined}
      >
        <Input
          id="reversal-note"
          value={note}
          maxLength={300}
          onChange={(event) => {
            onNote(event.target.value);
          }}
        />
      </Field>
    </div>
  );
}
