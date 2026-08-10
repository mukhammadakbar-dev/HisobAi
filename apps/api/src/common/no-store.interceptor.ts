import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * `Cache-Control: no-store` — barcha javoblar uchun default (`API.md` §9).
 *
 * Nega hamma joyda: bu ilovada deyarli har bir javob moliyaviy yoki
 * shaxsiy ma'lumot. Brauzer yoki oradagi proxy qarz qoldig'ini keshlab
 * qo'ysa, foydalanuvchi to'lovdan keyin ham eski summani ko'radi —
 * va unga ishonadi.
 *
 * Kesh kerak bo'ladigan kam sonli endpoint (masalan statik ma'lumotnoma)
 * o'z sarlavhasini o'zi qo'yadi: bu yerda faqat **qo'yilmagan** holat
 * to'ldiriladi.
 */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    if (!response.getHeader('Cache-Control')) {
      response.setHeader('Cache-Control', 'no-store');
    }
    return next.handle();
  }
}
