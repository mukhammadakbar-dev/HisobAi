import { Module } from '@nestjs/common';

import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

/**
 * Shartnoma hujjatlari (§15, §16.10). `StorageProvider` — `StorageModule`
 * global, alohida import shart emas (`files.module.ts`dagi bilan bir
 * xil naqsh).
 */
@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
