import 'reflect-metadata';

import { networkInterfaces } from 'node:os';

import { Logger, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { validateEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = validateEnv(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  /**
   * §2.9 — login urinishlari IP bo'yicha cheklanadi. Reverse proxy ortida
   * `trust proxy` sozlanmasa, BARCHA so'rov bitta IP bo'lib ko'rinadi va
   * cheklov yagona foydalanuvchini bloklab qo'yadi (audit S10).
   */
  app.set('trust proxy', 1);

  // Barcha route'lar `/api/v1/...` ostida. Swagger UI esa versiyasiz `/api/docs`da.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.use(helmet());
  app.use(cookieParser());

  /**
   * §2.8 — sessiya cookie'si bilan ishlash uchun credentials kerak.
   * `Retry-After` ochib qo'yiladi (`API.md` §9): CORS'da sarlavhalar
   * default yopiq — ro'yxatga tushmasa brauzer uni ko'rmaydi.
   *
   * Ro'yxat ANIQ: `WEB_ORIGIN` (+ ixtiyoriy `WEB_ORIGIN_EXTRA`). Bu yerda
   * ilgari `NODE_ENV === 'development'` shoxi va private-IP regexi bor edi;
   * ikkalasi ham fail-open edi — `NODE_ENV` standarti `development`,
   * ya'ni prodda o'zgaruvchi unutilsa har qanday origin `credentials`
   * bilan o'tib ketardi, regex esa prodda ham ishlardi.
   */
  const allowedOrigins = new Set(
    [env.WEB_ORIGIN, ...(env.WEB_ORIGIN_EXTRA?.split(',') ?? [])]
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  app.enableCors({
    /**
     * Ro'yxatda yo'q origin uchun XATO EMAS, `false` qaytariladi: so'rov
     * odatdagidek bajariladi, javobga faqat CORS sarlavhalari qo'shilmaydi.
     *
     * Xato qaytarilsa, telefondan LAN orqali kelgan login `500` bo'lardi.
     * Sababi: brauzer `POST` da `Origin` sarlavhasini same-origin holatda
     * ham yuboradi, Next rewrite proksisi esa uni o'zgartirmay uzatadi —
     * API `Origin: http://10.x.x.x:3000` ni ko'rib rad etardi, garchi
     * brauzer uchun bu so'rov same-origin bo'lsa ham. Bu ishga tushirib
     * tekshirilganda aniqlandi.
     *
     * Himoya zaiflashmaydi: haqiqiy cross-origin so'rovda javobda
     * `Access-Control-Allow-Origin` bo'lmaydi va brauzer natijani o'qishga
     * qo'ymaydi; `X-CSRF-Token` sarlavhali so'rov esa preflight'dan
     * o'tolmaydi. Sarlavhasiz oddiy forma POST'ini `CsrfGuard` to'sadi.
     */
    origin: (origin, callback) => {
      // `Origin`siz so'rov — server-to-server, `curl`, sog'liq tekshiruvi.
      callback(null, !origin || allowedOrigins.has(origin));
    },
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
  });

  /**
   * Nest'ning `ValidationPipe`'i ATAYLAB qo'yilmagan: validatsiya zod
   * sxemalari bilan qilinadi va sxemalar `@hisobai/contracts` da turadi —
   * shunda web ham, api ham bir xil qoidani qo'llaydi (`FRONTEND.md` §6.1).
   * Kontrollerda: `@Body(new ZodValidationPipe(createSaleSchema))`.
   * Mass assignment'dan himoya sxemadagi `.strict()` bilan ta'minlanadi.
   */

  if (env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('HisobAI CRM API')
      .setDescription('Ombor, savdo, nasiya, kassa va AI tahlil uchun REST API')
      .setVersion('0.2.1')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  // `0.0.0.0` — telefon LAN orqali `apps/web` proksisiga, u esa bu yerga uradi.
  await app.listen(env.PORT, '0.0.0.0');

  const lanHosts = Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);

  const logger = new Logger('Bootstrap');
  logger.log(`API tayyor: http://localhost:${env.PORT}/api/v1`);
  for (const host of lanHosts) {
    logger.log(`LAN: http://${host}:${env.PORT}/api/v1 (web: http://${host}:3000)`);
  }
}

void bootstrap();
