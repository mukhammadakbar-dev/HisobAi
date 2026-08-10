import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';

import { AuditModule } from './audit/audit.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { CsrfGuard } from './common/csrf.guard';
import { DecimalSerializerInterceptor } from './common/decimal-serializer.interceptor';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { RolesGuard } from './common/roles.guard';
import { validateEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),

    /**
     * Rate limiting (`API.md` §6). Ikki nomlangan qatlam:
     *  - `default` — o'qish uchun keng chegara;
     *  - `mutation` — o'zgartiruvchi so'rovlar uchun tor chegara,
     *    kontrollerda `@Throttle({ mutation: … })` bilan qo'llanadi.
     *
     * Auth endpointlari alohida: ular `login_attempts` jadvali orqali
     * email va IP bo'yicha bloklanadi (§2.9) — bu jadval blokni qayta
     * ishga tushirishdan keyin ham eslab qoladi, throttler esa xotirada.
     */
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: seconds(60), limit: 300 },
        { name: 'mutation', ttl: seconds(60), limit: 60 },
      ],
    }),

    DatabaseModule,
    AuditModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },

    /**
     * Guard tartibi muhim: ro'yxatdagi ketma-ketlik bo'yicha ishlaydi.
     * `ThrottlerGuard` birinchi — cheklovdan o'tmagan so'rov keyingi
     * tekshiruvlarga umuman yetib bormasin.
     */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RolesGuard },

    /**
     * Interceptor tartibi: idempotency `request.user` ga tayanadi, shuning
     * uchun u guard'lardan keyin (Nest'da guard'lar interceptor'lardan
     * oldin ishlaydi). Decimal serializatsiyasi eng tashqarida — u
     * idempotency keshidan qaytgan javobga ham qo'llanishi kerak.
     */
    { provide: APP_INTERCEPTOR, useClass: DecimalSerializerInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
