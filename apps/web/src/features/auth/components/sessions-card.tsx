'use client';

import { Monitor } from 'lucide-react';

import { EmptyState, ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Button, Card } from '../../../components/ui';
import { describeDevice, formatDateTime } from '../../../lib/format';
import { useRevokeOtherSessions, useRevokeSession, useSessions } from '../queries';
import { FormError } from './form-error';

/**
 * Faol sessiyalar (§2.7) — qurilma, IP, oxirgi kirish va chiqarish imkoni.
 *
 * `FRONTEND.md` §7 — to'rttala holat ham bor: loading (skeleton),
 * error (qayta urinish bilan), empty, data.
 */
export function SessionsCard() {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();

  const others = (sessions.data ?? []).filter((session) => !session.isCurrent);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-semibold">Faol sessiyalar</h2>

        {others.length > 0 && (
          <Button
            type="button"
            onClick={() => {
              revokeOthers.mutate();
            }}
            disabled={revokeOthers.isPending}
          >
            Boshqa qurilmalarni chiqarish ({others.length})
          </Button>
        )}
      </div>

      <FormError error={revoke.error ?? revokeOthers.error} />

      {sessions.isPending ? (
        <TableSkeleton rows={2} />
      ) : sessions.isError ? (
        <ErrorState
          error={sessions.error}
          onRetry={() => {
            void sessions.refetch();
          }}
        />
      ) : sessions.data.length === 0 ? (
        // Amalda yetib bo'lmaydigan holat — bu ro'yxatni ko'rish uchun
        // hech bo'lmasa bitta faol sessiya kerak. Baribir loyihalanadi (§7).
        <EmptyState title="Faol sessiya topilmadi." />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {sessions.data.map((session) => (
            <li
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-default p-3"
            >
              <div className="flex min-w-0 items-start gap-3">
                <Monitor
                  size={18}
                  className="mt-0.5 shrink-0 text-text-tertiary"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="m-0 flex flex-wrap items-center gap-2 font-medium">
                    {describeDevice(session.userAgent)}
                    {session.isCurrent && <Badge tone="info">Shu qurilma</Badge>}
                  </p>
                  <p className="m-0 text-sm text-text-secondary">
                    <span className="tabular">{session.ip ?? '—'}</span> · oxirgi faollik{' '}
                    <span className="tabular">{formatDateTime(session.lastSeenAt)}</span>
                  </p>
                  <p className="m-0 text-sm text-text-tertiary">
                    Amal qilish muddati:{' '}
                    <span className="tabular">{formatDateTime(session.expiresAt)}</span>
                  </p>
                </div>
              </div>

              {/*
                Joriy sessiyani bu yerdan yopib bo'lmaydi — buning uchun
                "Chiqish" tugmasi bor. Aks holda foydalanuvchi o'zini
                tasodifan chiqarib yuborardi.
              */}
              {!session.isCurrent && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    revoke.mutate(session.id);
                  }}
                  disabled={revoke.isPending}
                >
                  Chiqarish
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
