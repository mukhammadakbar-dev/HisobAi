'use client';

import { CashAccountKind, Currency, createCashAccountSchema } from '@hisobai/contracts';
import type { CashBalanceDto } from '@hisobai/contracts';
import { Plus, Wallet } from 'lucide-react';
import { useState } from 'react';

import { Money } from '../../../components/money/money';
import { MoneyInput } from '../../../components/money/money-input';
import { ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Button, Card, Field, Input, Select } from '../../../components/ui';
import { CASH_ACCOUNT_KIND_LABEL } from '../../../lib/labels';
import { errorMessage } from '../../../lib/messages';
import { useCashBalances, useCreateCashAccount, useOpeningBalance } from '../queries';
import { randomUuid } from '../../../lib/uuid';

/**
 * Kassa hisoblari va qoldiqlari (§11.1–§11.4).
 *
 * Hisoblar **ataylab ajratilgan**: karta puli kassa yashigida yo'q va
 * bir joyga qo'shilsa, kun oxirida naqd pulni sanaganda tizim bilan
 * hech qachon to'g'ri kelmaydi (§11.3). Shu sabab qoldiq har hisobda
 * o'z valyutasida ko'rsatiladi va umumiy "jami" chiqarilmaydi —
 * bazaviy valyutadagi jamlanma hisobotlar bosqichida keladi (§11.2).
 *
 * Boshlang'ich qoldiq (§11.4) — har hisob uchun **bir marta** va
 * daromad deb sanalmaydi. Kiritilgandan keyin tugma yo'qoladi:
 * ikkinchi urinishni server ham `CASH_OPENING_BALANCE_EXISTS` bilan
 * rad etadi.
 */
export function AccountsCard() {
  const balances = useCashBalances();
  const [creating, setCreating] = useState(false);
  const [openingFor, setOpeningFor] = useState<string | null>(null);

  if (balances.isPending) {
    return (
      <Card>
        <TableSkeleton rows={3} />
      </Card>
    );
  }

  if (balances.isError) {
    return (
      <ErrorState
        error={balances.error}
        onRetry={() => {
          void balances.refetch();
        }}
      />
    );
  }

  const accounts = balances.data;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-lg font-semibold">Kassa hisoblari</h2>
        <Button
          type="button"
          onClick={() => {
            setCreating((open) => !open);
          }}
          aria-expanded={creating}
        >
          <Plus size={16} aria-hidden="true" className="mr-2" />
          Yangi hisob
        </Button>
      </div>

      {creating && (
        <NewAccountForm
          onDone={() => {
            setCreating(false);
          }}
        />
      )}

      {accounts.length === 0 && !creating && (
        <p className="m-0 text-sm text-text-secondary">
          Hisob hali ochilmagan. Savdoni tasdiqlash uchun kamida bitta hisob kerak — pul aynan shu
          yerga tushadi (§17.2).
        </p>
      )}

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {accounts.map((account) => (
          <li key={account.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                <Wallet size={16} aria-hidden="true" className="text-text-tertiary" />
                <span className="font-medium">{account.name}</span>
                <Badge tone="info">
                  {CASH_ACCOUNT_KIND_LABEL[account.kind] ?? account.kind} · {account.currency}
                </Badge>
                {!account.isActive && <Badge tone="muted">Yopilgan</Badge>}
              </span>

              <span className="flex items-center gap-3">
                <span className="text-lg font-semibold">
                  <Money amount={account.balance} currency={account.currency} />
                </span>
                {!account.hasOpeningBalance && (
                  <Button
                    type="button"
                    onClick={() => {
                      setOpeningFor((current) => (current === account.id ? null : account.id));
                    }}
                    aria-expanded={openingFor === account.id}
                  >
                    Boshlang‘ich qoldiq
                  </Button>
                )}
              </span>
            </div>

            {openingFor === account.id && (
              <OpeningBalanceForm
                account={account}
                onDone={() => {
                  setOpeningFor(null);
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function NewAccountForm({ onDone }: { onDone: () => void }) {
  const create = useCreateCashAccount();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<Currency>(Currency.UZS);
  const [kind, setKind] = useState<CashAccountKind>(CashAccountKind.CASH);
  const [issues, setIssues] = useState<Record<string, string>>({});

  return (
    <form
      noValidate
      className="flex flex-col gap-3 rounded-md border border-border-default p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = createCashAccountSchema.safeParse({ name, currency, kind });
        if (!parsed.success) {
          setIssues(
            Object.fromEntries(
              parsed.error.issues.map((issue) => [issue.path.map(String).join('.'), issue.message]),
            ),
          );
          return;
        }
        setIssues({});
        create.mutate(parsed.data, { onSuccess: onDone });
      }}
    >
      {create.isError && (
        <p className="m-0 text-sm text-danger" role="alert">
          {errorMessage(create.error)}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="min-w-48 flex-2">
          <Field label="Hisob nomi" htmlFor="account-name" error={issues.name}>
            <Input
              id="account-name"
              value={name}
              placeholder="Masalan: Naqd so‘m"
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </Field>
        </div>
        <div className="min-w-32 flex-1">
          <Field label="Valyuta" htmlFor="account-currency" error={issues.currency}>
            {/* Valyuta keyin o'zgartirilmaydi — yozuvlar allaqachon shu valyutada */}
            <Select
              id="account-currency"
              value={currency}
              onChange={(event) => {
                setCurrency(event.target.value as Currency);
              }}
            >
              <option value={Currency.UZS}>so‘m (UZS)</option>
              <option value={Currency.USD}>dollar (USD)</option>
            </Select>
          </Field>
        </div>
        <div className="min-w-32 flex-1">
          <Field label="Turi" htmlFor="account-kind" error={issues.kind}>
            <Select
              id="account-kind"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as CashAccountKind);
              }}
            >
              {Object.values(CashAccountKind).map((value) => (
                <option key={value} value={value}>
                  {CASH_ACCOUNT_KIND_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {create.isPending ? 'Saqlanmoqda…' : 'Qo‘shish'}
        </Button>
        <Button type="button" onClick={onDone}>
          Bekor qilish
        </Button>
      </div>
    </form>
  );
}

function OpeningBalanceForm({ account, onDone }: { account: CashBalanceDto; onDone: () => void }) {
  const opening = useOpeningBalance();
  const [amount, setAmount] = useState('');
  // `API.md` §4.2 — kalit forma ochilganda; qayta bosish ikkinchi qoldiq yaratmaydi
  const [idempotencyKey] = useState(() => randomUuid());

  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-3 rounded-md border border-border-default p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (amount === '') return;
        opening.mutate(
          { input: { accountId: account.id, amount }, idempotencyKey },
          { onSuccess: onDone },
        );
      }}
    >
      <div className="min-w-44 flex-1">
        <Field
          label={`Boshlang‘ich qoldiq (${account.currency})`}
          htmlFor={`opening-${account.id}`}
        >
          <MoneyInput
            id={`opening-${account.id}`}
            currency={account.currency}
            value={amount}
            onChange={setAmount}
          />
        </Field>
      </div>

      <Button type="submit" variant="primary" disabled={opening.isPending || amount === ''}>
        {opening.isPending ? 'Yozilmoqda…' : 'Kiritish'}
      </Button>
      <Button type="button" onClick={onDone}>
        Bekor qilish
      </Button>

      {opening.isError && (
        <p className="m-0 basis-full text-sm text-danger" role="alert">
          {errorMessage(opening.error)}
        </p>
      )}

      <p className="m-0 basis-full text-sm text-text-tertiary">
        Boshlang‘ich qoldiq daromad deb sanalmaydi va har hisob uchun bir marta kiritiladi (§11.4).
      </p>
    </form>
  );
}
