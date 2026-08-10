import { Module } from '@nestjs/common';

import { SettingsModule } from '../settings/settings.module';
import { BrandsController, CategoriesController } from './taxonomy.controller';
import { TaxonomyService } from './taxonomy.service';

/**
 * Katalog: kategoriya, brend va mahsulot shabloni (§4).
 *
 * `SettingsModule` kerak: §3.8 bo'yicha mahsulotning `lowStockThreshold`
 * i `null` bo'lsa, sozlamalardagi umumiy chegara ishlatiladi.
 */
@Module({
  imports: [SettingsModule],
  controllers: [CategoriesController, BrandsController],
  providers: [TaxonomyService],
  exports: [TaxonomyService],
})
export class CatalogModule {}
