import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformSessionGuard } from './platform-session.guard';
import { ShopAdminsController } from './shop-admins.controller';
import { ShopAdminsService } from './shop-admins.service';

/**
 * Platforma (SUPERADMIN) moduli (§21.3, §25.3–§25.5, §25.17).
 *
 * `PlatformSessionGuard` bu yerda **eksport qilinadi**: `app.module.ts`
 * uni global `APP_GUARD` sifatida ro'yxatdan o'tkazadi (`RolesGuard`dan
 * OLDIN, `SessionGuard`dan KEYIN — izoh o'sha yerda).
 */
@Module({
  imports: [AuthModule],
  controllers: [PlatformAuthController, ShopAdminsController],
  providers: [PlatformAuthService, ShopAdminsService, PlatformSessionGuard],
  exports: [PlatformSessionGuard],
})
export class PlatformModule {}
