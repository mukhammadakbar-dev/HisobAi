import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginThrottleService } from './login-throttle.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, LoginThrottleService],
  // `LoginThrottleService` — `Platform` moduli ham chaqiradi: platforma
  // login urinishlari bir xil `login_attempts` jadvaliga tushadi
  // (`platform-auth.service.ts`dagi izoh, `login_attempts` schema
  // izohi bilan bir xil sabab).
  exports: [AuthService, LoginThrottleService],
})
export class AuthModule {}
