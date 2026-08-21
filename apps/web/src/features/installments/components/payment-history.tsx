'use client';

import { PaymentStatus } from '@hisobai/contracts';
import type { PaymentDto } from '@hisobai/contracts';
import { useMemo, useState } from 'react';

import { Money } from '../../../components/money/money';
import { ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Button, Card, Input } from '../../../components/ui';
import { formatDateTime } from '../../../lib/format';
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
} from '../../../lib/labels';
import { useContractPayments, usePaymentAction } from '../queries';
import { randomUuid } from '../../../lib/uuid';

/**
 * To'lovlar tarixi va o'tkazmani hal qilish (§12).
 *
 * Har to'lovda **uchala qiymat** ko'rinadi (§12): haqiqatda berilgan
 * summa, kurs va qarzdan qancha ayrilgani. Faqat oxirgisini ko'rsatish
 * "men 100 dollar berdim, nega qarzim boshqacha kamaydi" degan savolni
 * javobsiz qoldirardi.
 *
 * Taqsimot qatorlari ham ko'rsatiladi (§10.1): "qaysi oy yopildi" degan
 * savolga javob beradigan yagona joy.
 */
export function PaymentHistory({ contractId }: { contractId: string }) {
  const payments = useContractPayments(contractId);
  const action = usePaymentAction(contractId);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const idempotencyKey = useMemo(() => randomUuid(), [reasonFor]);

  if (payments.isPending) {
    return (
      <Card>
        <TableSkeleton rows={3} />
      </Card>
    );
  }

  if (payments.isError) {
    return (
      <Card>
        <ErrorState
          error={payments.error}
          onRetry={() => {
            void payments.refetch();
          }}
        />
      </Card>
    );
  }

  const rows = payments.data.data;

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="m-0 text-lg font-semibold">To‘lovlar</h2>

      {rows.length === 0 ? (
        <p className="m-0 text-sm text-text-tertiary">Hali to‘lov yozilmagan.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((payment) => (
            <li
              key={payment.id}
              className="flex flex-col gap-2 border-b border-border-default pb-3 last:border-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {PAYMENT_METHOD_LABEL[payment.method] ?? payment.method}
                  </span>
                  <Badge tone={PAYMENT_STATUS_TONE[payment.status] ?? 'muted'}>
                    {PAYMENT_STATUS_LABEL[payment.status] ?? payment.status}
                  </Badge>
                  <span className="text-text-secondary">{formatDateTime(payment.paidAt)}</span>
                  {payment.cashAccountName && (
                    <span className="text-text-secondary">{payment.cashAccountName}</span>
                  )}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Money amount={payment.paidAmount} currency={payment.paidCurrency} />
                  {/* §12 — qarzdan qancha ayrilgani alohida saqlanadi */}
                  {payment.paidCurrency !== payment.appliedCurrency && (
                    <span className="text-text-secondary">
                      (qarzdan{' '}
                      <Money amount={payment.appliedAmount} currency={payment.appliedCurrency} />)
                    </span>
                  )}
                </span>
              </div>

              {payment.allocations.length > 0 && (
                <div className="text-sm text-text-secondary">
                  {payment.allocations.map((allocation) => (
                    <span key={allocation.scheduleId} className="mr-3 inline-block">
                      {allocation.sequence}-oy:{' '}
                      <Money amount={allocation.amount} currency={payment.appliedCurrency} />
                    </span>
                  ))}
                </div>
              )}

              {payment.rejectedReason && (
                <div className="text-sm text-text-secondary">Sabab: {payment.rejectedReason}</div>
              )}

              <PaymentControls
                payment={payment}
                pending={action.isPending}
                reasonOpen={reasonFor === payment.id}
                reason={reason}
                onReason={setReason}
                onOpenReason={(open) => {
                  setReasonFor(open ? payment.id : null);
                  setReason('');
                }}
                onAct={(kind) => {
                  action.mutate(
                    { id: payment.id, action: kind, reason: reason.trim(), idempotencyKey },
                    {
                      onSuccess: () => {
                        setReasonFor(null);
                        setReason('');
                      },
                    },
                  );
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * §12 — kutilayotgan o'tkazma tasdiqlanadi yoki rad etiladi;
 * tasdiqlangan to'lov esa qaytariladi (§10.6).
 *
 * Rad etish va qaytarish **sababsiz bo'lmaydi**: ikkalasi ham pulga
 * ta'sir qiladi va oradan vaqt o'tib "nega bunday bo'lgan" degan savol
 * muqarrar.
 */
function PaymentControls({
  payment,
  pending,
  reasonOpen,
  reason,
  onReason,
  onOpenReason,
  onAct,
}: {
  payment: PaymentDto;
  pending: boolean;
  reasonOpen: boolean;
  reason: string;
  onReason: (value: string) => void;
  onOpenReason: (open: boolean) => void;
  onAct: (kind: 'confirm' | 'reject' | 'reverse') => void;
}) {
  const isPending = payment.status === PaymentStatus.PENDING_VERIFICATION;
  const isConfirmed = payment.status === PaymentStatus.CONFIRMED;

  if (!isPending && !isConfirmed) return null;

  if (reasonOpen) {
    return (
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Input
            id={`reason-${payment.id}`}
            aria-label="Sabab"
            value={reason}
            maxLength={300}
            placeholder="Sababni yozing"
            onChange={(event) => {
              onReason(event.target.value);
            }}
          />
        </div>
        <Button
          type="button"
          variant="danger"
          disabled={reason.trim().length < 3 || pending}
          onClick={() => {
            onAct(isPending ? 'reject' : 'reverse');
          }}
        >
          {isPending ? 'Rad etish' : 'Qaytarish'}
        </Button>
        <Button
          type="button"
          onClick={() => {
            onOpenReason(false);
          }}
        >
          Bekor qilish
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {isPending && (
        <Button
          type="button"
          variant="primary"
          disabled={pending}
          onClick={() => {
            onAct('confirm');
          }}
        >
          Tasdiqlash
        </Button>
      )}
      <Button
        type="button"
        onClick={() => {
          onOpenReason(true);
        }}
      >
        {isPending ? 'Rad etish' : 'Qaytarish'}
      </Button>
    </div>
  );
}
