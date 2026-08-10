import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { ApiError } from './api-error';
import { errorMessage } from './messages';

/**
 * Server xatosini forma maydonlariga bog'lash (`FRONTEND.md` §5.2).
 *
 * Server ikki shaklda maydon ko'rsatadi:
 *  - `error.field` — bitta maydonga tegishli biznes xatosi (masalan
 *    `AUTH_CURRENT_PASSWORD_INVALID` → `currentPassword`);
 *  - `details.issues[]` — `VALIDATION_FAILED` dagi maydonlar ro'yxati
 *    (`API.md` §3.2).
 *
 * Ikkalasi ham inputning **yoniga** chiqishi kerak: forma tepasidagi
 * umumiy banner "qaysi maydon" degan savolga javob bermaydi va uzun
 * formada foydalanuvchi xatoni qidirib yuradi.
 */

interface FieldProblem {
  field: string;
  message: string;
}

/**
 * Xatodagi barcha muammolar — maydon nomi bilan.
 *
 * `null` qaytsa, xato maydonga bog'lanmagan (tarmoq, `429`, `409` va
 * hokazo) va faqat banner sifatida ko'rsatiladi.
 */
function problemsOf(error: unknown): FieldProblem[] | null {
  if (!(error instanceof ApiError)) return null;

  if (error.issues.length > 0) {
    return error.issues.map((issue) => ({ field: issue.field, message: issue.message }));
  }

  // `errorMessage` — lug'atdagi o'zbekcha matn, server matni esa zaxira
  return error.field ? [{ field: error.field, message: errorMessage(error) }] : null;
}

/**
 * Maydon xatolarini `react-hook-form` ga o'rnatadi.
 *
 * `known` ro'yxati majburiy: serverdan kelgan nomni ko'r-ko'rona
 * `setError` ga berish formada mavjud bo'lmagan maydonga xato yozib
 * qo'yardi — u hech qachon ekranda ko'rinmaydi va xato "yo'qolgan"
 * bo'lib qolardi.
 */
export function applyApiFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  known: readonly Path<T>[],
): void {
  for (const problem of problemsOf(error) ?? []) {
    if ((known as readonly string[]).includes(problem.field)) {
      setError(problem.field as Path<T>, { type: 'server', message: problem.message });
    }
  }
}

/**
 * Xato to'liq maydonlarga bog'landimi — banner ko'rsatish kerakmi.
 *
 * Faqat **hammasi** bog'langanda `true`: bittasi ham formadan tashqarida
 * qolsa, banner qoladi va foydalanuvchi xabarsiz qolmaydi.
 */
export function isFieldOwnedError<T extends FieldValues>(
  error: unknown,
  known: readonly Path<T>[],
): boolean {
  const problems = problemsOf(error);
  if (!problems || problems.length === 0) return false;
  return problems.every((problem) => (known as readonly string[]).includes(problem.field));
}
