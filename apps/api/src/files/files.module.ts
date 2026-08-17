import { Module } from '@nestjs/common';

import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { MulterExceptionFilter } from './multer-exception.filter';

/**
 * Fayllar (§15). `StorageProvider` — `StorageModule` global, alohida
 * import shart emas (`database.module.ts`dagi `PrismaService` bilan
 * bir xil naqsh).
 */
@Module({
  controllers: [FilesController],
  providers: [FilesService, MulterExceptionFilter],
})
export class FilesModule {}
