import { Module } from '@nestjs/common';

import { SettingsModule } from '../settings/settings.module';
import { ProductsController } from './product.controller';
import { ProductService } from './product.service';
import { BrandsController, CategoriesController } from './taxonomy.controller';
import { TaxonomyService } from './taxonomy.service';

/**
 * Katalog: kategoriya, brend va mahsulot shabloni (§4).
 *
 * `SettingsModule` kerak: §3.8 bo'yicha mahsulotning `lowStockThreshold`
 * i `null` bo'lsa, sozlamalardagi umumiy chegara ishlatiladi.
 *
 * `ProductService` eksport qilinmaydi: ombor moduli qabul qilishda
 * mahsulotni **o'sha tranzaksiya ichida** o'qiydi va `lastCostPrice` ni
 * shu yerda yangilaydi (§5.11), ya'ni unga servis emas, `tx` kerak.
 * Ochiq eksport soxta bog'liqlik yaratardi.
 */
@Module({
  imports: [SettingsModule],
  controllers: [CategoriesController, BrandsController, ProductsController],
  providers: [TaxonomyService, ProductService],
  exports: [TaxonomyService],
})
export class CatalogModule {}
