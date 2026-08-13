import { Module } from '@nestjs/common';

import { CashModule } from '../cash/cash.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { SaleConfirmationService } from './sale-confirmation.service';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

/**
 * Savdo (§7).
 *
 * `CashModule` import qilinadi, chunki tasdiqlangan to'lov kassa
 * kirimini tug'diradi (§17.2) — va u **faqat** `CashEntriesService`
 * orqali yoziladi: savdo `cash_entries` ga to'g'ridan-to'g'ri yozsa,
 * "kassaga pul faqat to'lov orqali tushadi" qoidasi ikkinchi yo'l
 * bilan buzilardi.
 */
@Module({
  imports: [CashModule, ExchangeRatesModule],
  controllers: [SalesController],
  providers: [SalesService, SaleConfirmationService],
  exports: [SalesService],
})
export class SalesModule {}
