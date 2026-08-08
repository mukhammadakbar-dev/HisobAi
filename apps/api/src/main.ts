import 'reflect-metadata';

import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = validateEnv(process.env);
  const app = await NestFactory.create(AppModule);

  // Barcha route'lar `/api/v1/...` ostida. Swagger UI esa versiyasiz `/api/docs`da.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.use(helmet());
  app.use(cookieParser());

  // §2.8 — sessiya cookie'si bilan ishlash uchun credentials kerak.
  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
  });

  // Serverda majburiy qayta validatsiya (ARCHITECTURE §8).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('HisobAI CRM API')
    .setDescription('Ombor, savdo, nasiya, kassa va AI tahlil uchun REST API')
    .setVersion('0.2')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`API tayyor: http://localhost:${env.PORT}/api/v1`);
}

void bootstrap();
