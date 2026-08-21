'use client';

import { ContractStatus } from '@hisobai/contracts';
import type { InstallmentContractDto } from '@hisobai/contracts';
import Link from 'next/link';
import { useState } from 'react';

import { Money } from '../../../components/money/money';
import { Badge, Card } from '../../../components/ui';
import { Tabs } from '../../../components/ui/tabs';
import { formatDate } from '../../../lib/format';
import { CONTRACT_STATUS_LABEL, CONTRACT_STATUS_TONE } from '../../../lib/labels';
import { ContractActions } from './contract-actions';
import { ContractDocuments } from './contract-documents';
import { PaymentHistory } from './payment-history';
import { ScheduleTable } from './schedule-table';

/**
 * Shartnoma kartasi (§9).
 *
 * Jadval — ekranning asosiy qismi: mijoz uchun "qaysi oyda qancha" degan
 * savolga javob beradigan yagona joy. Kechikkan qatorlar **belgilanadi,
 * lekin jarima yozilmaydi** (§9.9): kechikish faqat ogohlantirish.
 *
 * Xulosa va amallar bo'limlardan TASHQARIDA turadi, jadval / tarix /
 * hujjatlar esa bo'limlarda. Sabab: birinchi ikkitasi har kirishda kerak,
 * qolgan uchtasi esa har biri o'z so'rovini olib keladi — ularni birga
 * chizish sahifani uch so'rovga aylantirardi. Endi ochilishda bitta.
 *
 * Qarz qoldig'i serverdan keladi va **hisoblanadi** (`outstanding`) —
 * ekranda qayta hisoblanmaydi, aks holda ikki manba paydo bo'lardi.
 */
type Tab = 'schedule' | 'history' | 'documents';

export function ContractCard({ contract }: { contract: InstallmentContractDto }) {
  const overdueCount = contract.schedules.filter((schedule) => schedule.isOverdue).length;
  const [tab, setTab] = useState<Tab>('schedule');

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">Savdo raqami</span>
            <span className="tabular text-xl font-semibold">{contract.saleNumber ?? '—'}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={CONTRACT_STATUS_TONE[contract.status] ?? 'muted'}>
              {CONTRACT_STATUS_LABEL[contract.status] ?? contract.status}
            </Badge>
            {/* §9.9 — jarima yo'q, faqat ogohlantirish */}
            {overdueCount > 0 && <Badge tone="danger">{overdueCount} ta to‘lov kechikkan</Badge>}
          </div>
        </div>

        <dl className="m-0 grid gap-2 text-sm sm:grid-cols-2">
          <Row
            label="Mijoz"
            value={contract.customerName ?? '—'}
            href={contract.customerId ? `/customers/${contract.customerId}` : undefined}
          />
          <Row
            label="Savdo"
            value={contract.saleNumber ?? '—'}
            href={`/sales/${contract.saleId}`}
          />
          {/* §17.3 — naqd narx ustamasiz; ustama alohida daromad satri (§9.4) */}
          <Amount label="Naqd narx" amount={contract.cashPrice} currency={contract.currency} />
          <Amount
            label={
              contract.markupPercent === null ? 'Ustama' : `Ustama (${contract.markupPercent}%)`
            }
            amount={contract.markupAmount}
            currency={contract.currency}
          />
          <Amount
            label="Boshlang‘ich to‘lov"
            amount={contract.downPayment}
            currency={contract.currency}
          />
          <Amount label="Qarz (jami)" amount={contract.principal} currency={contract.currency} />
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default pt-3">
          <div>
            <div className="text-sm text-text-secondary">Qolgan qarz</div>
            <div className="text-2xl font-semibold">
              <Money amount={contract.outstanding} currency={contract.currency} />
            </div>
          </div>
          {contract.closedAt && (
            <div className="text-right text-sm text-text-secondary">
              Yopilgan: {formatDate(contract.closedAt)}
            </div>
          )}
        </div>
      </Card>

      {/*
        Amallar bo'lim ortiga YASHIRILMAYDI: to'lov qabul qilish — bu ekran
        ochilishining asosiy sababi va kunlik ish. Uni bo'lim ostiga qo'yish
        har bir to'lovga bitta ortiqcha bosish qo'shardi.
      */}
      {contract.status === ContractStatus.ACTIVE && <ContractActions contract={contract} />}

      <Tabs
        items={[
          /*
            Faqat "Jadval" da son bor — u yuklangan shartnoma DTO'sida
            allaqachon mavjud. To'lovlar va hujjatlar soni esa o'sha
            komponentlarning O'Z so'rovlari ichida: ularni bu yerga
            ko'tarish ikkala so'rovni sahifa ochilganda ham yuborishni
            anglatardi — aynan shu xarajatni bo'limlar bartaraf qilyapti.
            `getQueryData` bilan "arzon" o'qish ham yaramaydi: u obuna
            bo'lmaydi, ya'ni son birinchi kirishda bo'sh, keyin eskirgan
            bo'lardi. Ba'zan noto'g'ri son — sonsizdan yomon.
          */
          { id: 'schedule', label: 'Jadval', badge: contract.schedules.length },
          { id: 'history', label: 'To‘lovlar tarixi' },
          { id: 'documents', label: 'Hujjatlar' },
        ]}
        active={tab}
        onChange={(id) => {
          setTab(id as Tab);
        }}
      />

      {/*
        Panel almashganda oldingisi unmount bo'ladi va o'z holatini
        yo'qotadi. Bu qabul qilingan: `staleTime` 60 s, ya'ni qaytib
        kelganda so'rov qayta yuborilmaydi va skeleton ko'rinmaydi.
        `PaymentHistory` dagi `idempotencyKey` ning qayta yasalishi
        XAVFSIZ: kalit faqat yuborishda ishlatiladi — yuborilmagan bo'lsa
        serverga umuman bormagan, yuborilgan bo'lsa `onSuccess` panelni
        allaqachon yopgan. Ya'ni takroriy to'lov oynasi ochilmaydi.
      */}
      {tab === 'schedule' && (
        <ScheduleTable schedules={contract.schedules} currency={contract.currency} />
      )}

      {tab === 'history' && <PaymentHistory contractId={contract.id} />}

      {tab === 'documents' && <ContractDocuments contract={contract} />}
    </div>
  );
}

function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="m-0 font-medium">
        {href ? (
          <Link href={href} className="text-link">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function Amount({
  label,
  amount,
  currency,
}: {
  label: string;
  amount: string;
  currency: InstallmentContractDto['currency'];
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="m-0 font-medium">
        <Money amount={amount} currency={currency} />
      </dd>
    </div>
  );
}
