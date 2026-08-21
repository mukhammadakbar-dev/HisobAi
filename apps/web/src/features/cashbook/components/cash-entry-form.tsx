'use client';

import { CashDirection, createCashEntrySchema } from '@hisobai/contracts';
import type { Currency } from '@hisobai/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { MoneyInput } from '../../../components/money/money-input';
import { ErrorState, TableSkeleton } from '../../../components/states';
import { Button, Card, Field, Input, Select } from '../../../components/ui';
import { ApiError } from '../../../lib/api-error';
import { CASH_DIRECTION_LABEL } from '../../../lib/labels';
import { errorMessage } from '../../../lib/messages';
import { useCashAccounts, useCashCategories, useCreateCashEntry } from '../queries';
import { randomUuid } from '../../../lib/uuid';

/**
 * Qo'lda kirim/chiqim (§11.9).
 *
 * Bu forma **faqat qo'lda kiritiladigan** pul harakati uchun: ijara,
 * kommunal, maosh va shunga o'xshash (§11.10). Savdodan tushgan pul bu
 * yerdan kiritilmaydi — u to'lov orqali keladi va kassa yozuvini
 * server o'zi yaratadi (§17.2). Shuning uchun formada `sourceType`
 * tanlovi yo'q: qo'lda yozuv har doim `MANUAL`.
 *
 * Summa valyutasi **hisobdan** kelib chiqadi (§11.1) — maydon
 * tanlangan hisobga qarab qayta yaxlitlanadi.
 */
export function CashEntryForm() {
  const router = useRouter();
  const accounts = useCashAccounts();
  const categories = useCashCategories();
  const create = useCreateCashEntry();

  const [direction, setDirection] = useState<CashDirection>(CashDirection.OUT);
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [issues, setIssues] = useState<Record<string, string>>({});
  // `API.md` §4.2 — kalit forma ochilganda yaratiladi
  const [idempotencyKey] = useState(() => randomUuid());

  if (accounts.isPending) {
    return (
      <Card>
        <TableSkeleton rows={4} />
      </Card>
    );
  }

  if (accounts.isError) {
    return <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />;
  }

  const activeAccounts = accounts.data.filter((account) => account.isActive);
  const account = activeAccounts.find((candidate) => candidate.id === accountId);
  const currency: Currency = account?.currency ?? 'UZS';
  // `null` yo'nalishli kategoriya ikkalasida ham ishlatiladi (§11.10)
  const visibleCategories = (categories.data ?? []).filter(
    (category) =>
      category.isActive && (category.direction === null || category.direction === direction),
  );

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = createCashEntrySchema.safeParse({
          accountId,
          direction,
          amount,
          categoryId: categoryId === '' ? null : categoryId,
          note: note.trim() === '' ? null : note.trim(),
        });

        if (!parsed.success) {
          setIssues(
            Object.fromEntries(
              parsed.error.issues.map((issue) => [issue.path.map(String).join('.'), issue.message]),
            ),
          );
          return;
        }

        setIssues({});
        create.mutate(
          { input: parsed.data, idempotencyKey },
          {
            onSuccess: () => {
              router.push('/cashbook');
            },
            onError: (error) => {
              if (error instanceof ApiError && error.field) {
                setIssues({ [error.field]: errorMessage(error) });
              }
            },
          },
        );
      }}
    >
      {create.isError && (
        <p
          className="m-0 rounded-md bg-danger-bg px-3 py-2 text-sm font-medium text-danger"
          role="alert"
        >
          {errorMessage(create.error)}
        </p>
      )}

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-36 flex-1">
            <Field label="Yo‘nalish" htmlFor="direction" error={issues.direction}>
              <Select
                id="direction"
                value={direction}
                onChange={(event) => {
                  setDirection(event.target.value as CashDirection);
                  // Kategoriya boshqa yo'nalishga tegishli bo'lib qolmasin
                  setCategoryId('');
                }}
              >
                {Object.values(CashDirection).map((value) => (
                  <option key={value} value={value}>
                    {CASH_DIRECTION_LABEL[value]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="min-w-48 flex-2">
            <Field label="Kassa hisobi" htmlFor="accountId" error={issues.accountId}>
              <Select
                id="accountId"
                value={accountId}
                onChange={(event) => {
                  setAccountId(event.target.value);
                }}
              >
                <option value="">Tanlang</option>
                {activeAccounts.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.currency})
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="min-w-40 flex-1">
            <Field label={`Summa (${currency})`} htmlFor="amount" error={issues.amount}>
              <MoneyInput id="amount" currency={currency} value={amount} onChange={setAmount} />
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="min-w-48 flex-1">
            <Field label="Kategoriya (ixtiyoriy)" htmlFor="categoryId" error={issues.categoryId}>
              <Select
                id="categoryId"
                value={categoryId}
                onChange={(event) => {
                  setCategoryId(event.target.value);
                }}
              >
                <option value="">Tanlanmagan</option>
                {visibleCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="min-w-48 flex-2">
            <Field label="Izoh (ixtiyoriy)" htmlFor="note" error={issues.note}>
              <Input
                id="note"
                value={note}
                placeholder="Masalan: avgust oyi ijarasi"
                onChange={(event) => {
                  setNote(event.target.value);
                }}
              />
            </Field>
          </div>
        </div>

        <p className="m-0 text-sm text-text-tertiary">
          Yozuv o‘sha kuni ichida tahrirlanadi yoki o‘chiriladi; ertasiga faqat teskari yozuv bilan
          tuzatiladi (§11.8).
        </p>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {create.isPending ? 'Yozilmoqda…' : 'Saqlash'}
        </Button>
        <Button
          type="button"
          onClick={() => {
            router.push('/cashbook');
          }}
        >
          Bekor qilish
        </Button>
      </div>
    </form>
  );
}
