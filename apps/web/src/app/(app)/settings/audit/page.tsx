'use client';

import { useState } from 'react';

import { ErrorState, TableSkeleton } from '../../../../components/states';
import { Card, Field, Input, Select } from '../../../../components/ui';
import { formatDateTime } from '../../../../lib/format';
import { useAuditLogs } from '../../../../features/reports/queries';

/**
 * Audit jurnali (§2.2) — **faqat o'qish uchun**.
 *
 * `PERMISSIONS.md` bo'yicha faqat `SHOP_ADMIN` ko'radi, shuning uchun
 * ekran sozlamalar bo'limida: u kundalik ish emas, tekshiruv vositasi.
 *
 * Yozuvni o'chiradigan yoki tahrirlaydigan tugma yo'q va bo'lmaydi:
 * bazada `hisobai_app` roli uchun `UPDATE`/`DELETE` bekor qilingan
 * (§12) — bunday tugma bosilganda baribir ishlamasdi.
 */
export default function AuditPage() {
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');

  const logs = useAuditLogs({
    ...(action === '' ? {} : { action }),
    ...(entityType === '' ? {} : { entityType }),
  });

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-semibold">Audit jurnali</h1>
        <p className="m-0 text-sm text-text-secondary">
          Har bir amal: kim qildi, qachon va nima o‘zgardi (§2.2). Yozuvlar o‘zgartirilmaydi.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Field label="Amal" htmlFor="audit-action">
          <Input
            id="audit-action"
            placeholder="SALE_CONFIRMED"
            value={action}
            onChange={(event) => {
              setAction(event.target.value.trim());
            }}
          />
        </Field>

        <Field label="Obyekt turi" htmlFor="audit-entity">
          <Select
            id="audit-entity"
            value={entityType}
            onChange={(event) => {
              setEntityType(event.target.value);
            }}
          >
            <option value="">Hammasi</option>
            {ENTITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Card className="p-0">
        {logs.isPending && (
          <div className="p-4">
            <TableSkeleton rows={6} />
          </div>
        )}

        {logs.isError && (
          <div className="p-4">
            <ErrorState
              error={logs.error}
              onRetry={() => {
                void logs.refetch();
              }}
            />
          </div>
        )}

        {logs.isSuccess && (
          <ul className="m-0 flex list-none flex-col p-0">
            {logs.data.data.map((log) => (
              <li key={log.id} className="border-b border-border-default p-3 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{log.action}</span>
                  <span className="text-text-secondary">{formatDateTime(log.createdAt)}</span>
                </div>
                <div className="text-sm text-text-secondary">
                  {log.entityType}
                  {log.actorName !== null && ` · ${log.actorName}`}
                  {log.ip !== null && ` · ${log.ip}`}
                </div>
                {/* O'zgarish tafsiloti — JSON holida. Uni "chiroyli"
                    ko'rsatish har amal uchun alohida shakl talab qilardi
                    va audit shundoq ham tekshiruv vositasi */}
                {(log.before !== null || log.after !== null) && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-sm text-link">Tafsilot</summary>
                    <pre className="m-0 mt-1 overflow-x-auto rounded-md bg-surface-raised p-2 text-xs">
                      {JSON.stringify({ before: log.before, after: log.after }, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}

        {logs.isSuccess && logs.data.data.length === 0 && (
          <p className="m-0 p-4 text-sm text-text-tertiary">Bunday yozuv topilmadi.</p>
        )}
      </Card>

      {logs.data?.hasMore === true && (
        <p className="m-0 text-sm text-text-tertiary">
          Birinchi {logs.data.data.length} ta yozuv ko‘rsatildi — filtr bilan toraytiring.
        </p>
      )}
    </div>
  );
}

/** Eng ko'p qidiriladigan turlar; ro'yxat to'liq emas va bo'lishi shart emas. */
const ENTITY_TYPES = ['Sale', 'Payment', 'InstallmentContract', 'Customer', 'Product', 'CashEntry'];
