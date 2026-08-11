import { Module } from '@nestjs/common';

import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

/**
 * Mijozlar (§6).
 *
 * Savdo moduli (5-bosqich) mijozni `customerId` orqali bog'laydi va
 * bu servisga bog'lanmaydi — nasiyada mijoz majburiyligi (§6.1)
 * savdoning o'z qoidasi.
 */
@Module({
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
