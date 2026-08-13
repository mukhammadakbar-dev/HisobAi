import { Module } from '@nestjs/common';

import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';

@Module({
  controllers: [ShopsController],
  providers: [ShopsService],
  // `Catalog` moduli kam qoldiq chegarasini, `ExchangeRates` esa kurs
  // ustamasini shu yerdan oladi (§3.8, §16.2)
  exports: [ShopsService],
})
export class ShopsModule {}
