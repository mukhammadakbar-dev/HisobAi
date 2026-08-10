import { Module } from '@nestjs/common';

import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  // `ExchangeRates` moduli ustama foizini shu yerdan oladi (§16.2)
  exports: [SettingsService],
})
export class SettingsModule {}
