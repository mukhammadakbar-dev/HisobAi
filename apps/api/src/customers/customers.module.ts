import { Module } from '@nestjs/common';

import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

/**
 * Mijozlar (§6).
 *
 * Savdo moduli (5-bosqich) mijozni `customerId` orqali bog'laydi va
 * bu servisga bog'lanmaydi — nasiyada mijoz majburiyligi (§6.1)
 * savdoning o'z qoidasi.
 *
 * `ExchangeRatesModule` — mijoz kartasidagi `outstandingDebt` ni
 * bazaviy valyutaga aylantirish uchun (bugungi do'kon kursi, §5.9 bilan
 * bir mantiq). O'qish faol nasiya shartnomasi jadvalidan to'g'ridan-to'g'ri
 * Prisma orqali — `Reports`/`Dashboard` modullarida ham xuddi shu naqsh
 * (§13.8, §14.3): faol shartnoma jadvali ko'p modul uchun umumiy o'qish
 * manbai, yozish esa faqat `Installments`/`Sales` tranzaksiyasida bo'ladi.
 */
@Module({
  imports: [ExchangeRatesModule],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
