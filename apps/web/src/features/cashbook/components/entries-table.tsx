'use client';

import { CashDirection } from '@hisobai/contracts';
import type { CashEntryDto } from '@hisobai/contracts';
import { Pencil, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';

import { Money } from '../../../components/money/money';
import { MoneyInput } from '../../../components/money/money-input';
import { EmptyState, ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Button, Card, Field, Input, Select } from '../../../components/ui';
import { useIdempotencyKey } from '../../../hooks/use-idempotency-key';
import { formatDateTime } from '../../../lib/format';
import { CASH_DIRECTION_LABEL, CASH_SOURCE_LABEL } from '../../../lib/labels';
import { errorMessage } from '../../../lib/messages';
import {
  useCashAccounts,
  useCashEntries,
  useDeleteCashEntry,
  useReverseCashEntry,
  useUpdateCashEntry,
} from '../queries';

/**
 * Kassa yozuvlari (§11.9).
 *
 * Tahrirlash va o'chirish tugmalari faqat `editable` yozuvda chiqadi.
 * Bu qiymatni **server** hisoblaydi (§11.7, §11.8): qo'lda kiritilgan
 * va o'sha kungi yozuvgina o'zgaradi. Client shu bayroqqa tayanadi va
 * o'z qoidasini takrorlamaydi — takrorlansa, ikkalasi bir kun
 * ajratishda (do'kon zonasi!) farq qilib qolardi.
 *
 * Avtomatik yozuvni tuzatish yo'li bitta: savdo yoki to'lovni qaytarish
 * (§11.7). Shuning uchun ular ro'yxatda ko'rinadi, lekin tugmasiz.
 */
export function EntriesTable() {
  const accounts = useCashAccounts(true);
  const [accountId, setAccountId] = useState('');
  const [direction, setDirection] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const entries = useCashEntries({
    accountId: accountId === '' ? undefined : accountId,
    direction: direction === '' ? undefined : direction,
    from: from === '' ? undefined : from,
    to: to === '' ? undefined : to,
  });

  const rows = entries.data?.data ?? [];
  const isFiltered = accountId !== '' || direction !== '' || from !== '' || to !== '';

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-3">
        <div className="min-w-44 flex-1">
          <label htmlFor="filter-account" className="sr-only">
            Hisob
          </label>
          <Select
            id="filter-account"
            value={accountId}
            onChange={(event) => {
              setAccountId(event.target.value);
            }}
          >
            <option value="">Barcha hisoblar</option>
            {(accounts.data ?? []).map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-36 flex-1">
          <label htmlFor="filter-direction" className="sr-only">
            Yo‘nalish
          </label>
          <Select
            id="filter-direction"
            value={direction}
            onChange={(event) => {
              setDirection(event.target.value);
            }}
          >
            <option value="">Kirim va chiqim</option>
            {Object.values(CashDirection).map((value) => (
              <option key={value} value={value}>
                {CASH_DIRECTION_LABEL[value]}
              </option>
            ))}
          </Select>
        </div>

        <div className="min-w-36 flex-1">
          <label htmlFor="filter-from" className="sr-only">
            Boshlanish sanasi
          </label>
          <Input
            id="filter-from"
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
            }}
          />
        </div>

        <div className="min-w-36 flex-1">
          <label htmlFor="filter-to" className="sr-only">
            Tugash sanasi
          </label>
          <Input
            id="filter-to"
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
            }}
          />
        </div>
      </Card>

      {entries.isPending && (
        <Card>
          <TableSkeleton rows={6} />
        </Card>
      )}

      {entries.isError && (
        <ErrorState
          error={entries.error}
          onRetry={() => {
            void entries.refetch();
          }}
        />
      )}

      {!entries.isPending && !entries.isError && rows.length === 0 && (
        <EmptyState
          title={
            isFiltered
              ? 'Bu filtr bo‘yicha yozuv topilmadi'
              : 'Hali kassa yozuvi yo‘q. Kirim yoki chiqim qo‘shing.'
          }
          actionLabel={isFiltered ? 'Filtrni tozalash' : undefined}
          onAction={
            isFiltered
              ? () => {
                  setAccountId('');
                  setDirection('');
                  setFrom('');
                  setTo('');
                }
              : undefined
          }
        />
      )}

      {rows.length > 0 && (
        <Card className="flex flex-col gap-0 p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-default text-left text-text-secondary">
                  <th className="p-3 font-medium">Sana</th>
                  <th className="p-3 font-medium">Hisob</th>
                  <th className="p-3 font-medium">Kategoriya</th>
                  <th className="p-3 font-medium">Manba</th>
                  <th className="p-3 font-medium">Summa</th>
                  <th className="p-3 font-medium">
                    <span className="sr-only">Amallar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {entries.data?.hasMore && (
        <p className="m-0 text-sm text-text-tertiary">
          Birinchi {rows.length} ta ko‘rsatildi — sana bo‘yicha toraytiring.
        </p>
      )}
    </div>
  );
}

function EntryRow({ entry }: { entry: CashEntryDto }) {
  const update = useUpdateCashEntry();
  const remove = useDeleteCashEntry();
  const reverse = useReverseCashEntry();
  const idempotency = useIdempotencyKey();
  const [editing, setEditing] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState(entry.amount);
  const [note, setNote] = useState(entry.note ?? '');
  const [confirming, setConfirming] = useState(false);

  const isIncome = entry.direction === CashDirection.IN;

  return (
    <>
      <tr className="border-b border-border-default last:border-0">
        <td className="tabular p-3 text-text-secondary">{formatDateTime(entry.occurredAt)}</td>
        <td className="p-3">{entry.accountName}</td>
        <td className="p-3 text-text-secondary">
          {entry.categoryName ?? '—'}
          {entry.note && <div className="text-text-tertiary">{entry.note}</div>}
        </td>
        <td className="p-3">
          <Badge tone={entry.sourceType === 'MANUAL' ? 'info' : 'muted'}>
            {CASH_SOURCE_LABEL[entry.sourceType] ?? entry.sourceType}
          </Badge>
        </td>
        <td className={`tabular p-3 font-medium ${isIncome ? 'text-success' : 'text-danger'}`}>
          {isIncome ? '+' : '−'}
          <Money amount={entry.amount} currency={entry.currency} withCurrency={false} />
        </td>
        <td className="p-3">
          {/* §11.7, §11.8 — bayroqni server hisoblaydi */}
          {entry.editable && (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => {
                  setEditing((open) => !open);
                  setConfirming(false);
                }}
                aria-expanded={editing}
              >
                <Pencil size={16} aria-hidden="true" />
                <span className="sr-only">Tahrirlash</span>
              </Button>
              <Button
                type="button"
                variant={confirming ? 'danger' : 'secondary'}
                disabled={remove.isPending}
                onClick={() => {
                  // Moliyaviy yozuv bir bosishda yo'qolmasin
                  if (!confirming) {
                    setConfirming(true);
                    return;
                  }
                  remove.mutate(entry.id);
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
                <span className="sr-only">
                  {confirming ? 'O‘chirishni tasdiqlash' : 'O‘chirish'}
                </span>
              </Button>
            </div>
          )}

          {/*
            §11.8 — ertangi kunda tuzatishning YAGONA yo'li. `reversible`
            ni ham server hisoblaydi va u `editable` bilan bir vaqtda
            rost bo'lmaydi, ya'ni bu yerda ikkala amal birga chiqmaydi.
          */}
          {entry.reversible && (
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => {
                  setReversing((open) => !open);
                }}
                aria-expanded={reversing}
              >
                <Undo2 size={16} aria-hidden="true" />
                <span className="sr-only">Teskari yozuv bilan tuzatish</span>
              </Button>
            </div>
          )}
        </td>
      </tr>

      {reversing && (
        <tr className="border-b border-border-default">
          <td colSpan={6} className="p-3">
            <form
              noValidate
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                reverse.mutate(
                  {
                    id: entry.id,
                    input: { reason: reason.trim() },
                    idempotencyKey: idempotency.key,
                  },
                  {
                    onSuccess: () => {
                      setReversing(false);
                      setReason('');
                      idempotency.renew();
                    },
                    onError: idempotency.renewAfterError,
                  },
                );
              }}
            >
              <div className="min-w-64 flex-1">
                <Field
                  label="Tuzatish sababi"
                  htmlFor={`reason-${entry.id}`}
                  error={reverse.isError ? errorMessage(reverse.error) : undefined}
                >
                  <Input
                    id={`reason-${entry.id}`}
                    value={reason}
                    onChange={(event) => {
                      setReason(event.target.value);
                    }}
                    placeholder="Masalan: summa xato kiritilgan"
                  />
                </Field>
              </div>
              <Button type="submit" disabled={reason.trim().length < 3 || reverse.isPending}>
                Teskari yozuv
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setReversing(false);
                }}
              >
                Bekor qilish
              </Button>
            </form>
            {/*
              Asl yozuv o'z joyida qoladi — teskari yozuv uning ustiga
              QO'SHILADI (§11.8, §21): o'tgan kunning kassa hisoboti bir
              marta chiqarilgandan keyin o'zgarmasligi kerak.
            */}
            <p className="m-0 mt-2 text-sm text-text-secondary">
              Asl yozuv o‘chmaydi — kassaga qarama-qarshi yo‘nalishdagi yangi yozuv qo‘shiladi.
            </p>
          </td>
        </tr>
      )}

      {editing && (
        <tr className="border-b border-border-default">
          <td colSpan={6} className="p-3">
            <form
              noValidate
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                update.mutate(
                  {
                    id: entry.id,
                    input: {
                      amount,
                      note: note.trim() === '' ? null : note.trim(),
                      expectedUpdatedAt: entry.updatedAt,
                    },
                  },
                  {
                    onSuccess: () => {
                      setEditing(false);
                    },
                  },
                );
              }}
            >
              <div className="min-w-40 flex-1">
                <Field label={`Summa (${entry.currency})`} htmlFor={`amount-${entry.id}`}>
                  <MoneyInput
                    id={`amount-${entry.id}`}
                    currency={entry.currency}
                    value={amount}
                    onChange={setAmount}
                  />
                </Field>
              </div>
              <div className="min-w-48 flex-2">
                <Field label="Izoh" htmlFor={`note-${entry.id}`}>
                  <Input
                    id={`note-${entry.id}`}
                    value={note}
                    onChange={(event) => {
                      setNote(event.target.value);
                    }}
                  />
                </Field>
              </div>

              <Button type="submit" variant="primary" disabled={update.isPending}>
                {update.isPending ? 'Saqlanmoqda…' : 'Saqlash'}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setAmount(entry.amount);
                  setNote(entry.note ?? '');
                }}
              >
                Bekor qilish
              </Button>

              {update.isError && (
                <p className="m-0 basis-full text-sm text-danger" role="alert">
                  {errorMessage(update.error)}
                </p>
              )}
            </form>
          </td>
        </tr>
      )}

      {remove.isError && (
        <tr>
          <td colSpan={6} className="px-3 pb-3">
            <p className="m-0 text-sm text-danger" role="alert">
              {errorMessage(remove.error)}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
