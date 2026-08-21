'use client';

import type { Currency, PaymentScheduleDto } from '@hisobai/contracts';

import { Money } from '../../../components/money/money';
import { Badge } from '../../../components/ui';
import { DataList } from '../../../components/ui/data-list';
import { formatDate } from '../../../lib/format';
import { SCHEDULE_LABEL, SCHEDULE_TONE } from '../../../lib/labels';

/**
 * To'lov jadvali (§9.6).
 *
 * Ilgari bu `contract-card.tsx` ichida xom `<table>` bo'lib, `overflow-x-auto`
 * ichiga solingan edi. 390px kenglikda bu shuni anglatardi: **`Summa` ustuni
 * ekrandan chiqib ketardi** va sotuvchi sahifani aynan o'sha raqam uchun
 * ochganiga qaramay, uni ko'rish uchun jadvalni yon tomonga surishi kerak
 * bo'lardi. `DataList` telefonda karta qatorlarini, noutbukda esa haqiqiy
 * jadvalni chizadi.
 *
 * `Card` ga o'ralmaydi: `DataList` desktopda o'z chegarasini chizadi — eski
 * koddagi `p-0` hacki aynan qo'sh chegarani yo'qotish uchun kerak bo'lgan.
 */
export function ScheduleTable({
  schedules,
  currency,
}: {
  schedules: PaymentScheduleDto[];
  currency: Currency;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="m-0 text-lg font-semibold">To‘lov jadvali</h2>

      <DataList<PaymentScheduleDto>
        label="To‘lov jadvali"
        rows={schedules}
        rowKey={(row) => row.id}
        /**
         * Kechikish holatdan ustun turadi: §9.8 bo'yicha "muddati o'tgan"
         * `ScheduleStatus` a'zosi emas, shuning uchun uni chekka rangi
         * ko'rsatadi. Rang yolg'iz signal emas — `Muddat` katagida
         * "kechikkan" so'zi ham turadi (`design.md` §6).
         */
        accent={(row) => (row.isOverdue ? 'danger' : SCHEDULE_TONE[row.status])}
        columns={[
          {
            header: '№',
            className: 'w-14',
            cell: (row) => <span className="tabular">{row.sequence}</span>,
          },
          {
            header: 'Muddat',
            mobile: 'primary',
            className: 'w-44',
            cell: (row) => (
              <span className="tabular">
                {formatDate(row.dueDate)}
                {row.isOverdue && <span className="ml-2 text-danger">kechikkan</span>}
              </span>
            ),
          },
          {
            header: 'Summa',
            mobile: 'amount',
            numeric: true,
            className: 'w-36',
            cell: (row) => (
              <Money amount={row.amountDue} currency={currency} withCurrency={false} />
            ),
          },
          /**
           * Telefonda ko'rsatilmaydi — ataylab. `amountPaid` sxemada KESH
           * (`schema.prisma`), haqiqat manbai `payment_allocations`, u esa
           * "Tarix" bo'limida qator-baqator ko'rinadi (§10.1). Kichik
           * ekranda foydalanuvchini keshga emas, manbaga yo'naltirgan
           * to'g'riroq; "to'landimi" degan savolga esa `Holat` javob beradi.
           */
          {
            header: 'To‘langan',
            numeric: true,
            className: 'w-36',
            cell: (row) => (
              <Money amount={row.amountPaid} currency={currency} withCurrency={false} />
            ),
          },
          {
            header: 'Holat',
            mobile: 'status',
            className: 'w-36',
            cell: (row) => (
              <Badge tone={SCHEDULE_TONE[row.status]}>{SCHEDULE_LABEL[row.status]}</Badge>
            ),
          },
        ]}
      />
    </section>
  );
}
