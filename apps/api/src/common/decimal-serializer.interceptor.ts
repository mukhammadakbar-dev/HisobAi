import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';

/**
 * Prisma `Decimal` ni JSON'ga **satr** sifatida chiqaradi (`API.md` §2.1).
 *
 * Nega kerak. `Decimal` ni to'g'ridan-to'g'ri `res.json()` ga bersa ikki
 * yomon variantdan biri chiqadi: yo ichki obyekt (`{"s":1,"e":7,"d":[…]}`),
 * yo `number` — ya'ni IEEE-754 float. Ikkalasi ham ARCHITECTURE §4 ni
 * buzadi: pul hech qachon float bo'lmaydi.
 *
 * Nega `toFixed(scale)` emas, `toString()`. Interceptor ixtiyoriy `Decimal`
 * maydonning valyutasini bila olmaydi — bitta javobda UZS summasi ham,
 * USD summasi ham, `Decimal(12,4)` kurs ham bo'lishi mumkin. Shuning uchun
 * bu yerda **aniq qiymat** o'zgarishsiz uzatiladi, yaxlitlash esa yozishdan
 * oldin serverda (§1.10) va ko'rsatishda `formatMoney` bilan qilinadi.
 */
@Injectable()
export class DecimalSerializerInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data: unknown) => serializeDecimals(data)));
  }
}

/** Rekursiv: massiv, obyekt va `Decimal` ni qamraydi. */
export function serializeDecimals(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeDecimals);
  }

  // Date, Buffer va boshqa maxsus obyektlar o'zgarishsiz qoladi
  if (value instanceof Date || value instanceof Buffer) {
    return value;
  }

  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      result[key] = serializeDecimals(source[key]);
    }
    return result;
  }

  return value;
}
