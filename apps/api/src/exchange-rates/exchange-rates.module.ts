import { Module } from '@nestjs/common';

import { SettingsModule } from '../settings/settings.module';
import { CbuRateProvider, HttpCbuRateProvider } from './cbu-rate.provider';
import { ExchangeRateSyncService } from './exchange-rate-sync.service';
import { ExchangeRatesController } from './exchange-rates.controller';
import { ExchangeRatesService } from './exchange-rates.service';

@Module({
  // Do'kon kursi ustama foiziga bog'liq (§16.2)
  imports: [SettingsModule],
  controllers: [ExchangeRatesController],
  providers: [
    ExchangeRatesService,
    ExchangeRateSyncService,
    { provide: CbuRateProvider, useClass: HttpCbuRateProvider },
  ],
  // Savdo va to'lov modullari kursni shu servisdan oladi (§17.11)
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
