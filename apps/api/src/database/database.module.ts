import { Global, Module } from '@nestjs/common';
import { PrismaService, withShopScope } from './prisma.service';

/**
 * DI'ga taqdim etiladigan `PrismaService` — **kengaytirilgan** (`withShopScope`)
 * klient, bazaviy klient emas (§21.7, `prisma.service.ts`ga qarang).
 *
 * `useFactory` kerak, `useClass` emas: `$extends()` yangi obyekt qaytaradi,
 * shuning uchun butun ilova bo'ylab `this.prisma.*` chaqiruvlari
 * kengaytirilgan versiyaga tegishi uchun Nest'ga aynan shu obyektni
 * qaytarish kerak. Lifecycle hook'lar (`onModuleInit`/`onModuleDestroy`)
 * baribir ishlaydi — `$extends()` asl instance metodlarini saqlab qoladi.
 */
@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: () => withShopScope(new PrismaService()),
    },
  ],
  exports: [PrismaService],
})
export class DatabaseModule {}
