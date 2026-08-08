import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma 7 da ulanish schema faylidan emas, driver adapteridan keladi.
 * `DATABASE_URL` shu yerda o'qiladi — CLI tomoni esa `prisma.config.ts`da.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL majburiy — apps/api/.env faylini tekshiring');
    }
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('PostgreSQL ulanishi tayyor');
    } catch (error) {
      // Noto'g'ri DATABASE_URL bilan jimgina ishlashdan ko'ra, sababi bilan yiqilamiz.
      this.logger.error(
        `PostgreSQL ulanmadi. DATABASE_URL ni tekshiring. ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
