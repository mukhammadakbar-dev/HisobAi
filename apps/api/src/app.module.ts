import { ExecutionContext, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import type { Request } from 'express';

import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CashModule } from './cash/cash.module';
import { CatalogModule } from './catalog/catalog.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { CsrfCookieMiddleware } from './common/csrf-cookie.middleware';
import { CsrfGuard } from './common/csrf.guard';
import { DecimalSerializerInterceptor } from './common/decimal-serializer.interceptor';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { NoStoreInterceptor } from './common/no-store.interceptor';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { RolesGuard } from './common/roles.guard';
import { SessionGuard } from './common/session.guard';
import { ShopContextInterceptor } from './common/shop-context.interceptor';
import { validateEnv } from './config/env';
import { CustomersModule } from './customers/customers.module';
import { DatabaseModule } from './database/database.module';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module';
import { HealthModule } from './health/health.module';
import { InventoryModule } from './inventory/inventory.module';
import { MailModule } from './mail/mail.module';
import { PlatformModule } from './platform/platform.module';
import { PlatformSessionGuard } from './platform/platform-session.guard';
import { ReportsModule } from './reports/reports.module';
import { InstallmentsModule } from './installments/installments.module';
import { PaymentsModule } from './payments/payments.module';
import { SalesModule } from './sales/sales.module';
import { ShopsModule } from './shops/shops.module';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isMutation(context: ExecutionContext): boolean {
  return MUTATING_METHODS.has(context.switchToHttp().getRequest<Request>().method);
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),

    /**
     * Rate limiting (`API.md` §6): o'qish 300/daq, mutatsiya 60/daq.
     *
     * **`skipIf` shart.** Nomlangan throttler'lar barcha marshrutlarga
     * BIRVARAKAYIGA qo'llanadi — ular "tanlanadigan profil" emas.
     * Usiz `mutation` cheklovi `GET` so'rovlarni ham 60/daq ga
     * tushirib qo'yardi va `API.md` dagi 300 hech qachon amal
     * qilmasdi. Har biri o'z metodlaridan tashqarisini o'tkazib
     * yuboradi.
     *
     * Auth endpointlari o'z chegarasini `@Throttle(...)` bilan
     * ustidan yozadi; §2.9 dagi doimiy blok esa `login_attempts`
     * jadvalida — u qayta ishga tushirishdan keyin ham eslab qoladi.
     */
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'read',
          ttl: seconds(60),
          limit: 300,
          skipIf: isMutation,
        },
        {
          name: 'mutation',
          ttl: seconds(60),
          limit: 60,
          skipIf: (context) => !isMutation(context),
        },
      ],
    }),

    DatabaseModule,
    AuditModule,
    MailModule,
    HealthModule,
    AuthModule,
    PlatformModule,
    ShopsModule,
    ExchangeRatesModule,
    CatalogModule,
    InventoryModule,
    CustomersModule,
    CashModule,
    SalesModule,
    PaymentsModule,
    InstallmentsModule,
    ReportsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },

    /**
     * Guard tartibi ro'yxatdagi ketma-ketlik bo'yicha:
     *
     *  1. `ThrottlerGuard` — cheklovdan o'tmagan so'rov keyingi
     *     tekshiruvlarga umuman yetib bormasin;
     *  2. `CsrfGuard` — o'zgartiruvchi so'rovda token mosligi;
     *  3. `SessionGuard` — business cookie'ni foydalanuvchiga aylantiradi
     *     (rad etmaydi, faqat aniqlaydi);
     *  4. `PlatformSessionGuard` — `@PlatformOnly()` YO'Q endpointda
     *     hech narsa qilmaydi; BOR bo'lsa platforma cookie'sini
     *     tekshiradi va — `SessionGuard`dan farqli — RAD HAM ETADI
     *     (§21.3: platforma yo'lida `RolesGuard`ga o'xshash ikkinchi
     *     qatlam yo'q, chunki SUPERADMIN'da rol tushunchasi umuman yo'q);
     *  5. `RolesGuard` — business **default DENY**, yagona rad etish
     *     nuqtasi; `@PlatformOnly()` ko'rsa chetga chiqadi (qaror
     *     allaqachon 4-qadamda qabul qilingan, `roles.guard.ts`).
     *
     * 3 va 5 ning tartibi majburiy: `RolesGuard` `request.user` ga
     * tayanadi, uni esa `SessionGuard` to'ldiradi. 4-qadam ularning
     * orasida bo'lishi shart emas (ikkalasiga ham bog'liq emas), lekin
     * shu yerda turishi mantiqiy: "kim bu so'rovni yubordi" barcha
     * savollari (business VA platforma) `RolesGuard`ning yakuniy
     * qaroridan OLDIN javob topgan bo'ladi.
     */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PlatformSessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },

    /**
     * Interceptor tartibi: idempotency `request.user` ga tayanadi, shuning
     * uchun u guard'lardan keyin (Nest'da guard'lar interceptor'lardan
     * oldin ishlaydi). Decimal serializatsiyasi eng tashqarida — u
     * idempotency keshidan qaytgan javobga ham qo'llanishi kerak.
     *
     * `ShopContextInterceptor` RO'YXATNING BOSHIDA: interceptor'lar piyoz
     * kabi ishlaydi, birinchi ro'yxatga olingani eng tashqarida bo'ladi —
     * Shop konteksti esa quyidagi ikkitasini HAM (jumladan idempotency
     * keshidan o'tgan yo'lni) qamrab olishi kerak, chunki ular ham
     * servis/Prisma qatlamiga tushishi mumkin (`shop-context.interceptor.ts`).
     */
    { provide: APP_INTERCEPTOR, useClass: ShopContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: NoStoreInterceptor },
    { provide: APP_INTERCEPTOR, useClass: DecimalSerializerInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // `{*path}` — Express 5 dagi "hamma yo'l" sintaksisi; eski `*` ogohlantirish beradi
    consumer.apply(RequestIdMiddleware, CsrfCookieMiddleware).forRoutes('{*path}');
  }
}
