import { sumMoney } from '@hisobai/contracts';
import type { Currency, DashboardCashAccountDto, DashboardPeriod } from '@hisobai/contracts';

import { CASH_ACCOUNT_KIND_LABEL } from '../../lib/labels';

/**
 * Davr bilan bog'liq matnlar (§14 kengaytma).
 *
 * KPI plitalari va delta izohi davrga qarab so'z almashtiradi — "bugun"
 * uchun "kechagidan", "shu hafta" uchun "avvalgi haftadan" va hokazo.
 * Backend faqat `changePercent` raqamini beradi, qiyoslov so'zini emas
 * (§14 — DTO `previous` sanasini alohida qaytarmaydi), shuning uchun
 * so'z tanlovi shu yerda, faqat matn darajasida.
 */
export const DASHBOARD_PERIOD_LABEL: Record<DashboardPeriod, string> = {
  today: 'Bugun',
  week: 'Shu hafta',
  month: 'Shu oy',
};

/** KPI "tushum" plitasi sarlavhasi — davrga mos. */
export function revenueTileLabel(period: DashboardPeriod): string {
  if (period === 'today') return 'Bugungi tushum';
  if (period === 'week') return 'Shu hafta tushumi';
  return 'Shu oy tushumi';
}

/** Delta izohidagi solishtiruv so'zi — "12% ↑ avvalgi kundan" kabi. */
export function comparisonLabel(period: DashboardPeriod): string {
  if (period === 'today') return 'avvalgi kundan';
  if (period === 'week') return 'avvalgi haftadan';
  return 'avvalgi oydan';
}

/** Bitta valyutadagi kassa qoldig'i — jami va turlar bo'yicha taqsimot. */
export interface CashSummaryGroup {
  currency: Currency;
  total: string;
  byKind: { kind: string; label: string; total: string }[];
}

/**
 * Kassa hisoblarini valyuta bo'yicha guruhlab, jamlaydi (§14.3 kengaytma).
 *
 * Qo'shish faqat **bitta valyuta ichida** bajariladi — `DashboardDto`
 * izohiga ko'ra kassa qoldig'i hisob valyutasida turadi va aylantirilmaydi,
 * shuning uchun turli valyutadagi hisoblarni bitta summaga qo'shish
 * noto'g'ri raqam berardi. `sumMoney` — `@hisobai/contracts` dagi aniq
 * o'nlik yig'indi (§17.14), oddiy `Number()` qo'shish emas.
 */
export function summarizeCash(accounts: DashboardCashAccountDto[]): CashSummaryGroup[] {
  const byCurrency = new Map<Currency, DashboardCashAccountDto[]>();
  for (const account of accounts) {
    const bucket = byCurrency.get(account.currency) ?? [];
    bucket.push(account);
    byCurrency.set(account.currency, bucket);
  }

  return [...byCurrency.entries()].map(([currency, rows]) => {
    const byKindMap = new Map<string, DashboardCashAccountDto[]>();
    for (const row of rows) {
      const bucket = byKindMap.get(row.kind) ?? [];
      bucket.push(row);
      byKindMap.set(row.kind, bucket);
    }

    return {
      currency,
      total: sumMoney(rows.map((row) => row.balance), currency),
      byKind: [...byKindMap.entries()].map(([kind, kindRows]) => ({
        kind,
        label: CASH_ACCOUNT_KIND_LABEL[kind] ?? kind,
        total: sumMoney(
          kindRows.map((row) => row.balance),
          currency,
        ),
      })),
    };
  });
}
