import { Module } from '@nestjs/common';

import { CashAccountsService } from './cash-accounts.service';
import { CashEntriesService } from './cash-entries.service';
import { CashController } from './cash.controller';

/**
 * Kassa (§11).
 *
 * `CashEntriesService` **eksport qilinadi**: savdo tasdiqlash
 * tranzaksiyasi (5-bosqich) tasdiqlangan to'lov uchun kassa kirimini
 * shu servis orqali yaratadi (§17.2). Savdo moduli `cash_entries` ga
 * to'g'ridan-to'g'ri yozmaydi — aks holda "kassaga pul faqat to'lov
 * orqali tushadi" qoidasi ikkinchi yo'l bilan buzilardi.
 */
@Module({
  controllers: [CashController],
  providers: [CashAccountsService, CashEntriesService],
  exports: [CashAccountsService, CashEntriesService],
})
export class CashModule {}
