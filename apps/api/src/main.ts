import 'reflect-metadata';

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

  // §2.8 — sessiya cookie'si bilan ishlash uchun credentials kerak.
  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  });

  /**
   * Nest'ning `ValidationPipe`'i ATAYLAB qo'yilmagan: validatsiya zod
   * sxemalari bilan qilinadi va sxemalar `@hisobai/contracts` da turadi —
   * shunda web ham, api ham bir xil qoidani qo'llaydi (`FRONTEND.md` §6.1).
   * Kontrollerda: `@Body(new ZodValidationPipe(createSaleSchema))`.
   * Mass assignment'dan himoya sxemadagi `.strict()` bilan ta'minlanadi.
   */

  const swaggerConfig = new DocumentBuilder()
    .setTitle('HisobAI CRM API')
    .setDescription('Ombor, savdo, nasiya, kassa va AI tahlil uchun REST API')
    .setVersion('0.2.1')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`API tayyor: http://localhost:${env.PORT}/api/v1`);
}

void bootstrap();
