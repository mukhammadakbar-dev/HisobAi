import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { AdminProfile, PushSubscriptionDto } from '@baraka/contracts';

@ApiTags('Notifications & Web Push')
@Controller()
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('push-subscriptions/vapid-public-key')
  @ApiOperation({ summary: 'Web Push uchun VAPID public key ni olish' })
  getVapidPublicKey(): { publicKey: string } {
    return this.notificationsService.getVapidPublicKey();
  }

  @Post('push-subscriptions')
  @ApiOperation({ summary: 'Admin brauzeri uchun Web Push obunasini saqlash' })
  async saveSubscription(
    @Body() dto: CreatePushSubscriptionDto,
    @CurrentAdmin() admin: AdminProfile,
  ): Promise<PushSubscriptionDto> {
    return this.notificationsService.saveSubscription(dto, admin.id);
  }

  @Delete('push-subscriptions/:id')
  @ApiOperation({ summary: 'Web Push obunasini o\'chirish' })
  async deleteSubscription(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminProfile,
  ): Promise<{ success: boolean }> {
    return this.notificationsService.deleteSubscription(id, admin.id);
  }

  @Post('notifications/trigger-reminders')
  @ApiOperation({ summary: 'To\'lov eslatmalarini darhol qayta ishlash va yuborish' })
  async triggerReminders(): Promise<{ success: boolean; message: string }> {
    await this.notificationsService.checkAndSendDueReminders();
    return {
      success: true,
      message: 'To\'lov eslatmalari muvaffaqiyatli tekshirildi va yuborildi',
    };
  }
}
