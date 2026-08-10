import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole, updateSettingsSchema } from '@hisobai/contracts';
import type { SettingsDto, UpdateSettingsInput } from '@hisobai/contracts';

import { Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { readPrecondition } from '../common/optimistic-lock';
import type { AuthedRequest, RequestUser } from '../common/request-user';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SettingsService } from './settings.service';

/**
 * Do'kon sozlamalari (§3.6–§3.10).
 *
 * `PERMISSIONS.md` P2 — mass assignment himoyasi sxemadagi `.strict()`
 * bilan: `id`, `logoFileId` va `updatedById` yuborilsa so'rov rad
 * etiladi, jimgina e'tiborsiz qoldirilmaydi.
 */
@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: "Do'kon sozlamalari" })
  get(): Promise<SettingsDto> {
    return this.settings.get();
  }

  /**
   * Optimistik qulf majburiy (`API.md` §8) — token so'rovdan shu yerda
   * ajratiladi: u HTTP tafsiloti (body yoki sarlavha), servis esa faqat
   * "qaysi holat kutilgan" degan domen faktini oladi.
   */
  @Patch()
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: "Sozlamalarni o'zgartirish (audit bilan)" })
  update(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateSettingsSchema)) body: UpdateSettingsInput,
    @Req() request: AuthedRequest,
  ): Promise<SettingsDto> {
    const precondition = readPrecondition(request, body.expectedUpdatedAt);
    return this.settings.update(user, body, precondition, request.ip ?? null);
  }
}
