'use client';

import { Currency } from '@hisobai/contracts';

import { Logo } from '../components/layout/logo';
import { ThemeToggle } from '../components/layout/theme-toggle';
import { Money } from '../components/money/money';
import { EmptyState, ErrorState, TableSkeleton } from '../components/states';
import { Badge, Button, Card, Field, Input } from '../components/ui';
import { ApiError } from '../lib/api-error';

/**
 * Poydevor sahifasi — 1-bosqich natijasini ko'z bilan tekshirish uchun.
 *
 * 2-bosqichda (Auth) bu sahifa `/login` yoki `/dashboard` ga
 * yo'naltirish bilan almashtiriladi.
 */
export default function FoundationPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-5 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border-default pb-6">
        <Logo className="h-8 w-auto" />
        <ThemeToggle />
      </header>

      <section className="flex flex-col gap-2">
        <h1 className="m-0 text-2xl font-semibold">Poydevor tayyor</h1>
        <p className="m-0 max-w-prose text-text-secondary">
          Xato formati, validatsiya, idempotency, pul serializatsiyasi, pagination, ruxsat va rate
          limiting o‘rnatildi. Biznes modullari shu qatlam ustiga quriladi.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-lg font-semibold">Pul ko‘rsatilishi</h2>
        <Card className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-text-secondary">Bugungi savdo</span>
            <Money amount="12500000" currency={Currency.UZS} className="text-xl font-semibold" />
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-text-secondary">USD qarz</span>
            <Money amount="1250.5" currency={Currency.USD} className="text-xl font-semibold" />
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm text-text-secondary">Qiymat yo‘q</span>
            <Money amount={null} currency={Currency.UZS} />
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-lg font-semibold">Holat belgilari</h2>
        <div className="flex flex-wrap gap-2">
          <Badge tone="success">To‘landi</Badge>
          <Badge tone="warning">Ertaga</Badge>
          <Badge tone="danger">12 kun kechikdi</Badge>
          <Badge tone="info">Tekshirilmoqda</Badge>
          <Badge tone="muted">Arxiv</Badge>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-lg font-semibold">Boshqaruv elementlari</h2>
        <Card className="flex flex-col gap-4">
          <Field label="Mijoz telefoni" htmlFor="phone">
            <Input id="phone" placeholder="+998 90 123 45 67" inputMode="tel" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary">Savdoni saqlash</Button>
            <Button variant="secondary">Bekor qilish</Button>
            <Button variant="danger">O‘chirish</Button>
            <Button variant="primary" disabled>
              Yuborilmoqda
            </Button>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-lg font-semibold">Yuklanish, xato, bo‘sh holat</h2>
        <Card>
          <TableSkeleton rows={3} />
        </Card>
        <ErrorState
          error={
            new ApiError({
              code: 'SALE_ITEM_NOT_AVAILABLE',
              message: '',
              status: 409,
            })
          }
        />
        <EmptyState
          title="Hali savdo yo‘q. Birinchi savdoni qo‘shing."
          actionLabel="Yangi savdo"
          onAction={() => undefined}
        />
      </section>
    </main>
  );
}
