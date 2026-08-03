import { Module } from '@nestjs/common';
import { CashbookService } from './cashbook.service';
import { CashbookController } from './cashbook.controller';

@Module({
  controllers: [CashbookController],
  providers: [CashbookService],
  exports: [CashbookService],
})
export class CashbookModule {}
