import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

import { runWithShopScope } from '../database/shop-context';
import type { AuthedRequest } from './request-user';

/**
 * `request.user.shopId`dan Shop kontekstini ochadi (§14.4, §25.12, §25.13).
 *
 * **Nega interceptor, middleware emas.** Nest'da so'rov Middleware →
 * Guard → Interceptor → handler tartibida o'tadi. `request.user`ni esa
 * `SessionGuard` to'ldiradi — u Guard. Middleware Guard'dan OLDIN ishlaydi,
 * ya'ni middleware bosqichida `request.user` hali yo'q. Shuning uchun bu
 * yerda interceptor kerak: u Guard'lardan (shu jumladan `RolesGuard`'ning
 * `SHOP_SETUP_REQUIRED` tekshiruvidan) KEYIN, lekin controller'dan OLDIN
 * ishlaydi.
 *
 * `app.module.ts`da RO'YXATNING BIRINCHISI sifatida ro'yxatdan o'tkaziladi:
 * Nest'da interceptor'lar piyoz kabi ishlaydi — birinchi ro'yxatga
 * olingani eng tashqarida, ya'ni u boshqa barcha interceptor'larni HAM
 * o'z ichiga oladi. Shop konteksti esa ularning barchasini — jumladan
 * `IdempotencyInterceptor`ning keshdan o'tgan yo'lini — qamrab olishi
 * kerak, chunki u ham servis qatlamiga (demak Prisma'ga) tushishi mumkin.
 *
 * **Faqat `request.user.shopId`dan — hech qachon so'rov parametri yoki
 * sarlavhadan emas** (§25.12): client qaysi tenant ekanini o'zi
 * tanlamaydi, buni backend sessiyadan aniqlaydi.
 *
 * `shopId` bo'lmasa (Shop'siz account, §21.10, yoki umuman
 * autentifikatsiyasiz `@Public()` so'rov) — kontekst ATAYLAB ochilmaydi.
 * Bu xato emas: shop-scoped endpointlar uchun `RolesGuard` allaqachon
 * `SHOP_SETUP_REQUIRED` bilan to'xtatgan bo'ladi (interceptor'gacha
 * yetib kelmaydi ham); chiqarilgan (`@ShopExempt()`) yoki `@Public()`
 * endpointlar esa Shop konteksti kerak bo'lmagan modellarga tegadi.
 */
@Injectable()
export class ShopContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const shopId = request.user?.shopId;

    if (typeof shopId !== 'string') {
      return next.handle();
    }

    // `next.handle()` — RxJS Observable, ya'ni asosiy ish `subscribe()`
    // chaqirilganda boshlanadi. `AsyncLocalStorage` faqat SHU chaqiruv
    // paytida ochilgan async davomiylikni kuzatadi, shuning uchun
    // `subscribe()` aynan `runWithShopScope()` ichida bo'lishi shart —
    // aks holda controller/servis/Prisma kontekstni ko'rmay qolardi.
    return new Observable((subscriber) => {
      runWithShopScope(shopId, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
