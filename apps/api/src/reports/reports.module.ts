import { Module } from '@nestjs/common';

import { CashModule } from '../cash/cash.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { DashboardService } from './dashboard.service';
import { ReportsController } from './reports.controller';

/**
 * Hisobotlar (`DECISIONS.md` §14).
 *
 * Kassa qoldiqlari `CashAccountsService` dan olinadi — dashboard o'z
 * qoldiq hisoblagichini yozmaydi: ikkita hisoblagich bir kun ajralib
 * ketardi va qaysi biri to'g'ri ekanini aniqlash mumkin bo'lmasdi.
 */
@Module({
  imports: [CashModule, ExchangeRatesModule],
  controllers: [ReportsController],
  providers: [DashboardService],
})
export class ReportsModule {}
