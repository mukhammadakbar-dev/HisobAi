'use client';

import { PaymentMethod, ScheduleStatus, convertMoney, sumMoney } from '@hisobai/contracts';
import type { InstallmentContractDto, ScheduleRow } from '@hisobai/contracts';
import { useState } from 'react';
import { Money } from '../../../components/money/money';
import { MoneyInput } from '../../../components/money/money-input';
import { Button, Card, Field, Input, Select } from '../../../components/ui';
import { useIdempotencyKey } from '../../../hooks/use-idempotency-key';
import { FormError } from '../../auth/components/form-error';
import { useCashAccounts } from '../../cashbook/queries';
import { useTodayRate } from '../../exchange-rates/queries';
import { PAYMENT_METHOD_LABEL } from '../../../lib/labels';
import { useCloseContract, useCreatePayment, useRebuildSchedule } from '../queries';
import { ScheduleRowsEditor } from './schedule-rows-editor';

type Mode = 'payment' | 'rebuild' | 'close' | null;

/**
 * Shartnoma ustidagi uchta amal (§10, §9.10, §9.12).
 *
 * Ular bitta kartada va bir vaqtda faqat bittasi ochiq: uchalasi ham
 * qarzga ta'sir qiladi va ikkitasini bir vaqtda to'ldirish "qaysi biri
 * yuborildi" degan savolni tug'dirardi.
 *
 * `Idempotency-Key` har panel ochilganda bir marta yaratiladi
 * (`API.md` §4.2): javob yo'qolib, ega tugmani qayta bosganda ikkinchi
 * to'lov yozilmasin — kassaga ikki barobar pul tushib, qarz ikki marta
 * kamayardi.
 */
export function ContractActions({ contract }: { contract: InstallmentContractDto }) {
  const [mode, setMode] = useState<Mode>(null);

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="m-0 text-lg font-semibold">Amallar</h2>

      {mode === null ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Choice
            title="To‘lov qabul qilish"
            description="Eng eski to‘lanmagan qatordan boshlab taqsimlanadi (§10.1)."
            onClick={() => {
              setMode('payment');
            }}
          />
          <Choice
            title="Jadvalni qayta tuzish"
            description="Faqat to‘lanmagan qatorlar; umumiy qarz o‘zgarmaydi (§9.10)."
            onClick={() => {
              setMode('rebuild');
            }}
          />
          <Choice
            title="Erta yopish"
            description="Qolgan qarz to‘liq to‘lanadi. Ustama qaytarilmaydi (§9.12)."
            onClick={() => {
              setMode('close');
            }}
          />
        </div>
      ) : mode === 'payment' ? (
        <PaymentForm
          contract={contract}
          onClose={() => {
            setMode(null);
          }}
        />
      ) : mode === 'rebuild' ? (
        <RebuildForm
          contract={contract}
          onClose={() => {
            setMode(null);
          }}
        />
      ) : (
        <CloseForm
          contract={contract}
          onClose={() => {
            setMode(null);
          }}
        />
      )}
    </Card>
  );
}

function Choice({
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
 * To'lov qabul qilish (§10).
 *
 * Summa **hisob valyutasida** kiritiladi (§11.1) va qarzdan qancha
 * ayrilishi shu yerda ko'rsatiladi (§10.5): ega ikkalasini ham ko'rib
 * turishi kerak, aks holda dollar hisobiga tushgan pul qarzni qancha
 * kamaytirgani noma'lum qolardi.
 *
 * §10.2, §16.11 — summa **qarz qoldig'idan oshsa** tugma ochilmaydi:
 * ortiqcha to'lov umuman kiritilmaydi, ortig'i mijozga qaytim sifatida
 * beriladi va tizimda yozuv qoldirmaydi.
 */
function PaymentForm({
  contract,
  onClose,
}: {
  contract: InstallmentContractDto;
  onClose: () => void;
}) {
  const accounts = useCashAccounts();
  const todayRate = useTodayRate();
  const createPayment = useCreatePayment(contract.id);
  const idempotency = useIdempotencyKey();

  const active = (accounts.data ?? []).filter((account) => account.isActive);
  const [accountId, setAccountId] = useState(() => active[0]?.id ?? '');
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [amount, setAmount] = useState('');

  const account = active.find((row) => row.id === accountId);
  const storeRate = todayRate.data?.rate?.storeRate ?? null;

  // §10.5 — qarzdan qancha ayriladi: shartnoma valyutasida
  const applied =
    account && amount.trim() !== '' && storeRate
      ? convertMoney(amount, account.currency, contract.currency, storeRate)
      : null;
  const exceeds = applied !== null && Number(applied) > Number(contract.outstanding);
  const disabled =
    accountId === '' ||
    amount.trim() === '' ||
    applied === null ||
    exceeds ||
    createPayment.isPending;

  const submit = (): void => {
    if (!account) return;
    createPayment.mutate(
      {
        idempotencyKey: idempotency.key,
        input: {
          contractId: contract.id,
          amount,
          currency: account.currency,
          method,
          cashAccountId: account.id,
          note: null,
        },
      },
      { onSuccess: onClose, onError: idempotency.renewAfterError },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <FormError error={createPayment.error} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Hisob" htmlFor="payment-account">
          <Select
            id="payment-account"
            value={accountId}
            onChange={(event) => {
              setAccountId(event.target.value);
            }}
          >
            {active.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} ({row.currency})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Usuli" htmlFor="payment-method">
          <Select
            id="payment-method"
            value={method}
            onChange={(event) => {
              setMethod(event.target.value as PaymentMethod);
            }}
          >
            {Object.values(PaymentMethod).map((value) => (
              <option key={value} value={value}>
                {PAYMENT_METHOD_LABEL[value] ?? value}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Summa"
          htmlFor="payment-amount"
          error={exceeds ? 'Qarz qoldig‘idan oshdi — ortig‘ini qaytim qiling (§10.2)' : undefined}
        >
          <MoneyInput
            id="payment-amount"
            currency={account?.currency ?? contract.currency}
            value={amount}
            onChange={setAmount}
          />
        </Field>
      </div>

      {/* §17.2 — o'tkazma kassaga darhol tushmaydi; ega uni keyin tasdiqlaydi */}
      {method === PaymentMethod.TRANSFER && (
        <p className="m-0 rounded-md bg-info-bg p-3 text-sm text-info">
          O‘tkazma “Tekshirilmoqda” holatida yoziladi — pul kelgani aniqlangach tasdiqlaysiz. Qarz
          faqat o‘shanda kamayadi.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default pt-3">
        <div className="text-sm">
          <span className="text-text-secondary">Qarzdan ayriladi: </span>
          {applied === null ? (
            <span className="text-text-tertiary">—</span>
          ) : (
            <span className="font-semibold">
              <Money amount={applied} currency={contract.currency} />
            </span>
          )}
          <span className="ml-3 text-text-secondary">Qoldiq: </span>
          <Money amount={contract.outstanding} currency={contract.currency} />
        </div>
        <div className="flex gap-2">
          <Button type="button" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="button" variant="primary" disabled={disabled} onClick={submit}>
            {createPayment.isPending ? 'Yuborilmoqda…' : 'To‘lovni yozish'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Jadvalni qayta tuzish (§9.10, §9.11).
 *
 * Ekranda **faqat to'lanmagan qatorlar** ko'rsatiladi va ular
 * almashtiriladi. To'langan qatorlar umuman chiqmaydi: ularni
 * tahrirlash mumkin emas (§9.10) va ro'yxatda ko'rinib turishi
 * "nega o'zgartirolmayapman" degan savol tug'dirardi.
 */
function RebuildForm({
  contract,
  onClose,
}: {
  contract: InstallmentContractDto;
  onClose: () => void;
}) {
  const rebuild = useRebuildSchedule(contract.id);
  const idempotency = useIdempotencyKey();

  const replaceable = contract.schedules.filter(
    (schedule) => schedule.status === ScheduleStatus.UNPAID,
  );
  // §9.11 — umumiy qarz o'zgarmaydi: almashtiriladigan qatorlar qoldig'i
  const target = sumMoney(
    replaceable.map((schedule) => schedule.amountDue),
    contract.currency,
  );

  const [rows, setRows] = useState<ScheduleRow[]>(() =>
    replaceable.map((schedule) => ({ dueDate: schedule.dueDate, amount: schedule.amountDue })),
  );
  const [reason, setReason] = useState('');

  const total = sumMoney(
    rows.map((row) => row.amount),
    contract.currency,
  );
  const balanced = total === target;
  const disabled = !balanced || reason.trim().length < 3 || rows.length === 0 || rebuild.isPending;

  if (replaceable.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="m-0 text-sm text-text-secondary">
          Qayta tuzish uchun to‘lanmagan qator yo‘q — jadvalning hammasi to‘langan yoki qisman
          to‘langan (§9.10).
        </p>
        <Button type="button" onClick={onClose} className="self-start">
          Yopish
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <FormError error={rebuild.error} />

      <p className="m-0 text-sm text-text-secondary">
        Faqat to‘lanmagan qatorlar almashtiriladi. Umumiy qarz o‘zgarmaydi — yangi jadval summasi{' '}
        <Money amount={target} currency={contract.currency} /> bo‘lishi kerak (§9.11).
      </p>

      <ScheduleRowsEditor rows={rows} currency={contract.currency} onChange={setRows} />

      <Field label="Sabab (§9.11)" htmlFor="rebuild-reason">
        <Input
          id="rebuild-reason"
          value={reason}
          maxLength={300}
          placeholder="Masalan: mijoz ish joyini o‘zgartirdi"
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default pt-3">
        <span className={balanced ? 'text-sm' : 'text-sm text-danger'}>
          Jadval summasi: <Money amount={total} currency={contract.currency} />
          {!balanced && (
            <>
              {' '}
              (kerak: <Money amount={target} currency={contract.currency} />)
            </>
          )}
        </span>
        <div className="flex gap-2">
          <Button type="button" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={disabled}
            onClick={() => {
              rebuild.mutate(
                { idempotencyKey: idempotency.key, input: { schedule: rows, reason: reason.trim() } },
                { onSuccess: onClose, onError: idempotency.renewAfterError },
              );
            }}
          >
            {rebuild.isPending ? 'Yuborilmoqda…' : 'Jadvalni saqlash'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Erta yopish (§9.12).
 *
 * `expectedOutstanding` — ekranda ko'rsatilgan qoldiq. Server undan
 * farq qilsa amalni rad etadi: oradan o'tgan vaqtda boshqa to'lov
 * tushgan bo'lishi mumkin va ega o'zi ko'rgan summadan boshqa summani
 * jimgina to'lab qo'ymasligi kerak.
 */
function CloseForm({
  contract,
  onClose,
}: {
  contract: InstallmentContractDto;
  onClose: () => void;
}) {
  const accounts = useCashAccounts();
  const close = useCloseContract(contract.id);
  const idempotency = useIdempotencyKey();

  const active = (accounts.data ?? []).filter((account) => account.isActive);
  const [accountId, setAccountId] = useState(() => active[0]?.id ?? '');
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.CASH);

  return (
    <div className="flex flex-col gap-4">
      <FormError error={close.error} />

      <p className="m-0 rounded-md bg-warning-bg p-3 text-sm text-warning">
        Qolgan qarz <Money amount={contract.outstanding} currency={contract.currency} /> to‘liq
        to‘langan deb yoziladi va shartnoma yopiladi. <strong>Ustama qaytarilmaydi</strong> — u
        savdo kunida tan olingan daromad (§17.3).
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Hisob" htmlFor="close-account">
          <Select
            id="close-account"
            value={accountId}
            onChange={(event) => {
              setAccountId(event.target.value);
            }}
          >
            {active.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} ({row.currency})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Usuli" htmlFor="close-method">
          <Select
            id="close-method"
            value={method}
            onChange={(event) => {
              setMethod(event.target.value as PaymentMethod);
            }}
          >
            {Object.values(PaymentMethod).map((value) => (
              <option key={value} value={value}>
                {PAYMENT_METHOD_LABEL[value] ?? value}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex justify-end gap-2 border-t border-border-default pt-3">
        <Button type="button" onClick={onClose}>
          Bekor qilish
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={accountId === '' || close.isPending}
          onClick={() => {
            close.mutate(
              {
                idempotencyKey: idempotency.key,
                input: {
                  expectedOutstanding: contract.outstanding,
                  method,
                  cashAccountId: accountId,
                  note: null,
                },
              },
              { onSuccess: onClose, onError: idempotency.renewAfterError },
            );
          }}
        >
          {close.isPending ? 'Yuborilmoqda…' : 'Shartnomani yopish'}
        </Button>
      </div>
    </div>
  );
}
