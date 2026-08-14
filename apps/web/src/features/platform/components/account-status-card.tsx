'use client';

import { AccountStatus } from '@hisobai/contracts';
import type { ShopAdminDto } from '@hisobai/contracts';

import { Button, Card } from '../../../components/ui';
import { errorMessage } from '../../../lib/messages';
import { ACCOUNT_STATUS_LABEL } from '../../../lib/labels';
import { useUpdateShopAdminStatus } from '../queries';

/**
 * Hisob holatini boshqarish (§25.19, §21.6).
 *
 * Uchta holat bor, lekin ekranda **ikkita tugma**: joriy holatga o'tish
 * tugmasi ko'rsatilmaydi. Uchala tugmani doim ko'rsatish foydalanuvchini
 * "hozir qaysi holatdaman?" degan savolni Badge'dan qidirishga majbur
 * qilardi.
 *
 * `SUSPENDED` va `DISABLED` farqi ataylab matnda tushuntiriladi: ikkalasi
 * ham kirishni to'sadi (§25.19), farqi niyatda — biri vaqtincha, ikkinchisi
 * hamkorlik tugagani. Tizim ularni bir xil majburlaydi, shuning uchun
 * tanlov faqat hisobot va audit uchun ma'noga ega.
 */
const TRANSITIONS: { status: AccountStatus; label: string; variant?: 'primary' }[] = [
  { status: AccountStatus.ACTIVE, label: 'Faollashtirish', variant: 'primary' },
  { status: AccountStatus.SUSPENDED, label: 'Vaqtincha to‘xtatish' },
  { status: AccountStatus.DISABLED, label: 'O‘chirish' },
];

export function AccountStatusCard({ admin }: { admin: ShopAdminDto }) {
  const update = useUpdateShopAdminStatus(admin.id);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-base font-semibold">Hisob holati</h2>
        <p className="m-0 text-sm text-text-secondary">
          Joriy holat — <strong>{ACCOUNT_STATUS_LABEL[admin.status] ?? admin.status}</strong>.
          To‘xtatilgan va o‘chirilgan hisob CRM’ga kira olmaydi.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TRANSITIONS.filter((item) => item.status !== admin.status).map((item) => (
          <Button
            key={item.status}
            type="button"
            variant={item.variant}
            disabled={update.isPending}
            onClick={() => {
              update.mutate({ status: item.status });
            }}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {update.isError && (
        <p className="m-0 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
          {errorMessage(update.error)}
        </p>
      )}
    </Card>
  );
}
