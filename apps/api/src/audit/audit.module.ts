import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit.service';

/**
 * Audit deyarli har bir modulga kerak (§2.2), shuning uchun global.
 * Har modulda alohida import qilish faqat shovqin qo'shardi.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
