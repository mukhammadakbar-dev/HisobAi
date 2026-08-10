'use client';

import { EmptyState, ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Card } from '../../../components/ui';
import { describeDevice, formatDateTime } from '../../../lib/format';
import { useLoginAttempts } from '../queries';

/**
 * Kirish jurnali (§2.10) — muvaffaqiyatli va muvaffaqiyatsiz urinishlar.
 *
 * Muvaffaqiyatsiz urinishlar ham ko'rsatiladi: ularsiz jurnal o'z
 * maqsadini bajarmaydi — ega hisobiga kim urinayotganini ko'rishi kerak.
 */
export function LoginAttemptsCard() {
  const attempts = useLoginAttempts();

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="m-0 text-lg font-semibold">Kirish jurnali</h2>

      {attempts.isPending ? (
        <TableSkeleton rows={4} />
      ) : attempts.isError ? (
        <ErrorState
          error={attempts.error}
          onRetry={() => {
            void attempts.refetch();
          }}
        />
      ) : attempts.data.length === 0 ? (
        <EmptyState title="Hali kirish urinishi yozilmagan." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Oxirgi kirish urinishlari</caption>
            <thead>
              <tr className="border-b border-border-default text-left text-text-secondary">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Vaqt
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Email
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  IP
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  Qurilma
                </th>
                <th scope="col" className="py-2 font-medium">
                  Natija
                </th>
              </tr>
            </thead>
            <tbody>
              {attempts.data.map((attempt) => (
                <tr key={attempt.id} className="border-b border-border-soft">
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {formatDateTime(attempt.createdAt)}
                  </td>
                  <td className="py-2 pr-4">{attempt.email}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{attempt.ip ?? '—'}</td>
                  <td className="py-2 pr-4">{describeDevice(attempt.userAgent)}</td>
                  <td className="py-2">
                    {/* Rang yagona signal emas (TZ §20) — badge'da matn bor */}
                    {attempt.success ? (
                      <Badge tone="success">Muvaffaqiyatli</Badge>
                    ) : (
                      <Badge tone="danger">Muvaffaqiyatsiz</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
