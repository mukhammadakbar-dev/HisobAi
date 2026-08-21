'use client';

import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Bir xil ma'lumotning ikki ko'rinishi (`design.md` §6).
 *
 * Telefonda — karta qatorlari, noutbukda — haqiqiy jadval.
 *
 * Nega kerak edi: ro'yxat sahifalarida jadval qo'lda yozilib,
 * `overflow-x-auto` ichiga solingan edi. 390px kenglikda bu shuni
 * anglatardi: eng muhim ustun — SUMMA — ekrandan chiqib ketardi va
 * sotuvchi qarzni ko'rish uchun jadvalni yon tomonga surishi kerak
 * bo'lardi. Endi mobil qatorda summa o'ng tomonda, kattaroq kegl bilan
 * doim ko'rinadi; qolgan ustunlar tafsilot ekraniga qoladi.
 *
 * Ustunlar bir marta e'lon qilinadi va ikkala ko'rinish ham o'shandan
 * chiziladi — ya'ni jadval bilan karta bir-biridan ajralib qolmaydi.
 */

export type MobileSlot = 'primary' | 'secondary' | 'amount' | 'status' | 'hidden';

export interface DataColumn<T> {
  header: string;
  cell: (row: T) => ReactNode;
  /** Pul yoki son: o'ngga tekislanadi va `tabular` oladi. */
  numeric?: boolean;
  /**
   * Mobil kartada qayerda turadi. Berilmasa — kartada ko'rinmaydi
   * (jadvalda esa baribir bor).
   */
  mobile?: MobileSlot;
  /** Jadval ustuni kengligi, masalan `w-40`. */
  className?: string;
}

/** `Badge` tonlari bilan bir xil — chekka rangi holat belgisini takrorlaydi. */
type AccentTone = 'success' | 'warning' | 'danger' | 'info' | 'muted';

const ACCENT_BORDER: Record<AccentTone, string> = {
  success: 'border-l-success',
  warning: 'border-l-warning',
  danger: 'border-l-danger',
  info: 'border-l-info',
  muted: 'border-l-border-default',
};

export interface DataListProps<T> {
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;
  /** Berilsa qator bosiladigan bo'ladi (mobilda butun karta). */
  onRowClick?: (row: T) => void;
  /** Chap chekka rangi — holatni takrorlaydi, rang yolg'iz signal bo'lmasin. */
  accent?: (row: T) => AccentTone | undefined;
  /** Ekran o'quvchisi uchun jadval nomi. */
  label: string;
}

function slotOf<T>(columns: DataColumn<T>[], slot: MobileSlot): DataColumn<T> | undefined {
  return columns.find((column) => column.mobile === slot);
}

export function DataList<T>({ rows, columns, rowKey, onRowClick, accent, label }: DataListProps<T>) {
  const primary = slotOf(columns, 'primary');
  const secondary = slotOf(columns, 'secondary');
  const amount = slotOf(columns, 'amount');
  const status = slotOf(columns, 'status');
  const clickable = onRowClick !== undefined;

  return (
    <>
      {/* Telefon va planshet: karta qatorlari */}
      <ul className="m-0 flex list-none flex-col gap-2 p-0 md:hidden" aria-label={label}>
        {rows.map((row) => {
          const tone = accent?.(row);
          const body = (
            <>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {primary && (
                  <span className="truncate text-[15px] font-semibold text-text-primary">
                    {primary.cell(row)}
                  </span>
                )}
                {secondary && (
                  <span className="tabular truncate text-xs text-text-tertiary">
                    {secondary.cell(row)}
                  </span>
                )}
                {status && <span className="mt-0.5">{status.cell(row)}</span>}
              </div>

              <div className="flex shrink-0 flex-col items-end justify-between gap-1">
                {amount && (
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="text-[10px] font-semibold tracking-wider text-text-tertiary uppercase">
                      {amount.header}
                    </span>
                    <span className="tabular text-[17px] font-semibold whitespace-nowrap text-text-primary">
                      {amount.cell(row)}
                    </span>
                  </span>
                )}
                {clickable && (
                  <ChevronRight size={19} aria-hidden="true" className="shrink-0 text-text-tertiary" />
                )}
              </div>
            </>
          );

          const shell = `flex w-full items-stretch gap-3 rounded-lg border border-border-default ${
            tone ? `border-l-3 ${ACCENT_BORDER[tone]}` : ''
          } bg-surface-card p-3 text-left`;

          return (
            <li key={rowKey(row)}>
              {clickable ? (
                <button
                  type="button"
                  onClick={() => {
                    onRowClick(row);
                  }}
                  className={`${shell} min-h-14`}
                >
                  {body}
                </button>
              ) : (
                <div className={shell}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Noutbuk: haqiqiy jadval — bu yerda joy bor va ustunlar qiyoslanadi */}
      <div className="hidden overflow-hidden rounded-lg border border-border-default md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr className="bg-surface-raised text-left">
              {columns.map((column) => (
                <th
                  key={column.header}
                  scope="col"
                  className={`p-3 font-medium text-text-secondary ${column.numeric ? 'text-right' : ''} ${column.className ?? ''}`}
                >
                  {column.header}
                </th>
              ))}
              {clickable && <th scope="col" className="w-12 p-3" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={clickable ? () => { onRowClick(row); } : undefined}
                className={`border-t border-border-soft ${clickable ? 'cursor-pointer hover:bg-surface-raised' : ''}`}
              >
                {columns.map((column) => (
                  <td
                    key={column.header}
                    className={`p-3 text-text-primary ${column.numeric ? 'tabular text-right font-semibold' : ''}`}
                  >
                    {column.cell(row)}
                  </td>
                ))}
                {clickable && (
                  <td className="p-3 text-text-tertiary">
                    <ChevronRight size={18} aria-hidden="true" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
