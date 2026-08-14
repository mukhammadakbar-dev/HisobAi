import { Module } from '@nestjs/common';

import { CashModule } from '../cash/cash.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { AllocationService } from './allocation.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

/**
 * Nasiya to'lovlari (§10, §12).
 *
 * `CashModule` — kassa yozuvlari **faqat** `CashEntriesService` orqali
 * yoziladi (§17.2), savdo moduli bilan bir xil qoida.
 *
 * `AllocationService` **eksport qilinadi**: shartnomani erta yopish
 * (§9.12) va jadvalni qayta tuzish (§9.10) ham qarz qoldig'ini aynan
 * shu hisob bilan o'qishi kerak. Ikkinchi nusxa yozilsa, ikki ekran
 * bitta shartnoma uchun ikki xil qarz ko'rsatishi mumkin edi.
 */
@Module({
  imports: [CashModule, ExchangeRatesModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, AllocationService],
  exports: [PaymentsService, AllocationService],
})
export class PaymentsModule {}
