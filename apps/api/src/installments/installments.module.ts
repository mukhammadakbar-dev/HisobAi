import { Module } from '@nestjs/common';

import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { PaymentsModule } from '../payments/payments.module';
import { InstallmentsController } from './installments.controller';
import { InstallmentsService } from './installments.service';

/**
 * Nasiya shartnomalari (§9).
 *
 * `PaymentsModule` import qilinadi, chunki erta yopish (§9.12) oddiy
 * to'lov sifatida yoziladi — alohida yo'l yozilsa, kassaga pul tushishi
 * ikkinchi marta boshqacha yozilardi va §17.2 buzilardi.
 */
@Module({
  imports: [PaymentsModule, ExchangeRatesModule],
  controllers: [InstallmentsController],
  providers: [InstallmentsService],
  exports: [InstallmentsService],
})
export class InstallmentsModule {}
