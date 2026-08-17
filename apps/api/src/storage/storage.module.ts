import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';
import { LocalStorageProvider } from './local-storage.provider';
import { MinioStorageProvider } from './minio-storage.provider';
import { StorageProvider } from './storage.provider';

/**
 * `STORAGE_DRIVER` env qiymati adapterni tanlaydi (`mail.module.ts` bilan
 * bir xil naqsh). `useFactory` — `useClass` emas: tanlov runtime env'ga
 * bog'liq, `MailModule`dagi kabi ikkita static variant emas.
 */
@Global()
@Module({
  providers: [
    {
      provide: StorageProvider,
      useFactory: (config: ConfigService<Env, true>): StorageProvider =>
        config.get('STORAGE_DRIVER', { infer: true }) === 'minio'
          ? new MinioStorageProvider(config)
          : new LocalStorageProvider(config),
      inject: [ConfigService],
    },
  ],
  exports: [StorageProvider],
})
export class StorageModule {}
