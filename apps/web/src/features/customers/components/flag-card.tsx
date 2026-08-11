'use client';

import type { CustomerDto } from '@hisobai/contracts';
import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';

import { Button, Card, Field, Input } from '../../../components/ui';
import { errorMessage } from '../../../lib/messages';
import { useUpdateCustomer } from '../queries';

/**
 * §6.9 — "Ehtiyot bo'ling" belgisi va sababi.
 *
 * Belgi **taqiqlamaydi**: nasiya savdo boshlanganda ogohlantiradi
 * (5–7-bosqichlar). Shu sabab bu yerda hech qanday bloklovchi holat
 * yo'q — faqat sabab yozib qo'yiladi.
 *
 * Sabab majburiy va uni sxema ham, baza ham talab qiladi
 * (`customers_flag_has_reason`). Sababsiz belgi keyin hech kimga hech
 * narsa aytmaydi: "ehtiyot bo'ling, lekin nimadan?"
 */
export function FlagCard({ customer }: { customer: CustomerDto }) {
  const update = useUpdateCustomer(customer.id);
  const [reason, setReason] = useState('');

  const flag = (): void => {
    update.mutate(
      { isFlagged: true, flagReason: reason.trim(), expectedUpdatedAt: customer.updatedAt },
      {
        onSuccess: () => {
          setReason('');
        },
      },
    );
  };

  const unflag = (): void => {
    // Sabab server tomonda tozalanadi — eskirgan matn qaytib chiqmasin
    update.mutate({ isFlagged: false, expectedUpdatedAt: customer.updatedAt });
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ShieldAlert size={18} aria-hidden="true" className="text-warning" />
        <h2 className="m-0 text-lg font-semibold">Ehtiyot belgisi</h2>
      </div>

      {customer.isFlagged ? (
        <>
          <p className="m-0 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning">
            {customer.flagReason}
          </p>
          <div>
            <Button type="button" onClick={unflag} disabled={update.isPending}>
              Belgini olib tashlash
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 text-sm text-text-tertiary">
            Nasiya savdo boshlanganda ogohlantiradi, lekin taqiqlamaydi (§6.9).
          </p>
          <Field label="Sababi" htmlFor="flagReason">
            <Input
              id="flagReason"
              value={reason}
              placeholder="Masalan: to‘lovni ikki marta kechiktirgan"
              onChange={(event) => {
                setReason(event.target.value);
              }}
            />
          </Field>
          <div>
            <Button
              type="button"
              onClick={flag}
              disabled={update.isPending || reason.trim() === ''}
            >
              Belgilash
            </Button>
          </div>
        </>
      )}

      {update.isError && (
        <p className="m-0 text-sm text-danger" role="alert">
          {errorMessage(update.error)}
        </p>
      )}
    </Card>
  );
}
