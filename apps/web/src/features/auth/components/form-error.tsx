'use client';

import { ApiError } from '../../../lib/api-error';
import { errorMessage } from '../../../lib/messages';

/**
 * Forma tepasidagi xato banneri (`FRONTEND.md` §5.2).
 *
 * `ErrorState` dan farqi: bu yerda "qayta urinish" tugmasi yo'q — formada
 * qayta urinish tugmasi allaqachon bor (yuborish tugmasining o'zi), ikkinchisi
 * foydalanuvchini chalg'itadi.
 */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;

  return (
    <p
      role="alert"
      className="m-0 rounded-md bg-danger-bg px-3 py-2 text-sm font-medium text-danger"
    >
      {describe(error)}
    </p>
  );
}

/**
 * `429` da qolgan vaqt aniq aytiladi (`FRONTEND.md` §5.2).
 *
 * Lug'atdagi umumiy matn ("biroz kutib turing") foydalanuvchiga qancha
 * kutishni aytmaydi va u odatda darhol qayta bosadi — bu esa blokni
 * uzaytiradi. Server aniq muddatni `details.retryAfterSeconds` da beradi
 * (`API.md` §9).
 */
function describe(error: unknown): string {
  if (error instanceof ApiError && error.retryAfterSeconds !== undefined) {
    const minutes = Math.ceil(error.retryAfterSeconds / 60);
    return minutes <= 1
      ? "Juda ko'p urinish bo'ldi. Bir daqiqadan keyin qaytadan urinib ko'ring."
      : `Juda ko'p urinish bo'ldi. ${String(minutes)} daqiqadan keyin qaytadan urinib ko'ring.`;
  }

  return errorMessage(error);
}
