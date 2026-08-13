import { Module } from '@nestjs/common';

import { ShopsModule } from '../shops/shops.module';
import { ProductsController } from './product.controller';
import { ProductService } from './product.service';
import { BrandsController, CategoriesController } from './taxonomy.controller';
import { TaxonomyService } from './taxonomy.service';

/**
 * Katalog: kategoriya, brend va mahsulot shabloni (§4).
 *
 * `ShopsModule` kerak: §3.8 bo'yicha mahsulotning `lowStockThreshold`
 * i `null` bo'lsa, do'kon sozlamalaridagi umumiy chegara ishlatiladi
 * (eski `SettingsModule`, §21.4).
 *
 * `ProductService` eksport qilinmaydi: ombor moduli qabul qilishda
 * mahsulotni **o'sha tranzaksiya ichida** o'qiydi va `lastCostPrice` ni
 * shu yerda yangilaydi (§5.11), ya'ni unga servis emas, `tx` kerak.
 * Ochiq eksport soxta bog'liqlik yaratardi.
 */
@Module({
  imports: [ShopsModule],
  controllers: [CategoriesController, BrandsController, ProductsController],
  providers: [TaxonomyService, ProductService],
  exports: [TaxonomyService],
})
export class CatalogModule {}
