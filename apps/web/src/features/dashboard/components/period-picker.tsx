'use client';

import type { DashboardPeriod } from '@hisobai/contracts';

import { FilterChip } from '../../../components/ui/filters';
import { DASHBOARD_PERIOD_LABEL } from '../utils';

/**
 * Boshqaruv sahifasining davr tanlovi (§14 kengaytma).
 *
 * `/reports` dagi `PeriodPicker` dan ATAYLAB alohida: u ixtiyoriy
 * oraliq va "Oldingi oy" ni ham beradi, lekin `GET /dashboard`
 * faqat `today`/`week`/`month` qabul qiladi (`dashboardQuerySchema`) —
 * API qabul qilmaydigan tugmani ko'rsatish foydalanuvchini
 * chalg'itardi.
 */
const PERIODS: DashboardPeriod[] = ['today', 'week', 'month'];

export function DashboardPeriodPicker({
  period,
  onChange,
}: {
  period: DashboardPeriod;
  onChange: (period: DashboardPeriod) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Davr">
      {PERIODS.map((option) => (
        <FilterChip
          key={option}
          active={option === period}
          dismissable={false}
          onClick={() => {
            onChange(option);
          }}
        >
          {DASHBOARD_PERIOD_LABEL[option]}
        </FilterChip>
      ))}
    </div>
  );
}
