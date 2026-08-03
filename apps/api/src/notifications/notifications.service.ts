import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnApplicationBootstrap,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as webPush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { SMS_PROVIDER, SmsProvider } from './interfaces/sms-provider.interface';
import { CreatePushSubscriptionDto } from './dto/create-push-subscription.dto';
import { PushSubscriptionDto } from '@baraka/contracts';
import { NotificationChannel, NotificationStatus } from '@prisma/client';

@Injectable()
export class NotificationsService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationsService.name);
  private vapidPublicKey: string;
  private vapidPrivateKey: string;
  private vapidSubject: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  async onModuleInit() {
    this.initVapidKeys();
  }

  async onApplicationBootstrap() {
    // Run reminder check once on startup as specified in TZ 3.6
    this.logger.log('Running startup payment due reminder check...');
    await this.checkAndSendDueReminders();
  }

  private initVapidKeys() {
    this.vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
    this.vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
    this.vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@hisobai.uz';

    if (!this.vapidPublicKey || !this.vapidPrivateKey) {
      this.logger.warn(
        '⚠️ VAPID keys not found in process.env. Generating temporary dev VAPID keys...',
      );
      const generatedKeys = webPush.generateVAPIDKeys();
      this.vapidPublicKey = generatedKeys.publicKey;
      this.vapidPrivateKey = generatedKeys.privateKey;

      this.logger.log(`\n==================================================`);
      this.logger.log(`DEV VAPID KEYS GENERATED (Save to your .env file):`);
      this.logger.log(`VAPID_PUBLIC_KEY=${this.vapidPublicKey}`);
      this.logger.log(`VAPID_PRIVATE_KEY=${this.vapidPrivateKey}`);
      this.logger.log(`VAPID_SUBJECT=${this.vapidSubject}`);
      this.logger.log(`==================================================\n`);
    }

    webPush.setVapidDetails(
      this.vapidSubject,
      this.vapidPublicKey,
      this.vapidPrivateKey,
    );
  }

  getVapidPublicKey(): { publicKey: string } {
    return { publicKey: this.vapidPublicKey };
  }

  private mapSubscriptionDto(sub: any): PushSubscriptionDto {
    return {
      id: sub.id,
      adminId: sub.adminId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      createdAt: sub.createdAt.toISOString(),
    };
  }

  async saveSubscription(
    dto: CreatePushSubscriptionDto,
    adminId: string,
  ): Promise<PushSubscriptionDto> {
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { endpoint: dto.endpoint },
    });

    if (existing) {
      const updated = await this.prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          adminId,
          p256dh: dto.p256dh,
          auth: dto.auth,
        },
      });
      return this.mapSubscriptionDto(updated);
    }

    const created = await this.prisma.pushSubscription.create({
      data: {
        adminId,
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
      },
    });

    return this.mapSubscriptionDto(created);
  }

  async deleteSubscription(idOrEndpoint: string, adminId?: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.pushSubscription.findFirst({
      where: {
        OR: [{ id: idOrEndpoint }, { endpoint: idOrEndpoint }],
      },
    });

    if (!existing) {
      throw new NotFoundException('Push obuna topilmadi');
    }

    await this.prisma.pushSubscription.delete({
      where: { id: existing.id },
    });

    return { success: true };
  }

  // Daily cron at 09:00 Asia/Tashkent (or per env REMINDER_HOUR)
  @Cron(process.env.REMINDER_CRON || CronExpression.EVERY_DAY_AT_9AM, {
    name: 'paymentDueRemindersCron',
  })
  async handleCronReminders() {
    this.logger.log('Executing scheduled 09:00 payment due reminders job...');
    await this.checkAndSendDueReminders();
  }

  async checkAndSendDueReminders() {
    try {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);

      const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 0, 0, 0, 0);
      const tomorrowEnd = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59, 999);

      // 1. Find payment schedules due TOMORROW that are not fully paid
      const dueSchedules = await this.prisma.paymentSchedule.findMany({
        where: {
          dueDate: {
            gte: tomorrowStart,
            lte: tomorrowEnd,
          },
          status: { in: ['PENDING', 'PARTIAL'] },
        },
        include: {
          contract: {
            include: {
              customer: true,
            },
          },
        },
      });

      if (dueSchedules.length === 0) {
        this.logger.log('No payments due tomorrow for reminder notification.');
        return;
      }

      this.logger.log(`Found ${dueSchedules.length} payment schedule(s) due tomorrow.`);

      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

      for (const sched of dueSchedules) {
        const customer = sched.contract?.customer;
        if (!customer) continue;

        const amountDue = Number(sched.amountDue) - Number(sched.amountPaid);
        if (amountDue <= 0) continue;

        // Idempotency check: see if a log exists for this schedule
        const existingLog = await this.prisma.notificationLog.findFirst({
          where: {
            type: 'PAYMENT_DUE_REMINDER',
            referenceId: sched.id,
          },
        });

        if (existingLog) {
          if (existingLog.status === NotificationStatus.SENT) {
            // Already sent, skip
            continue;
          }

          if (
            existingLog.status === NotificationStatus.PROCESSING &&
            existingLog.updatedAt > tenMinutesAgo
          ) {
            // Currently being processed by another worker, skip
            continue;
          }
        }

        // Atomic lock: update or create log status to PROCESSING
        let logId = existingLog?.id;
        if (existingLog) {
          await this.prisma.notificationLog.update({
            where: { id: existingLog.id },
            data: { status: NotificationStatus.PROCESSING },
          });
        } else {
          const createdLog = await this.prisma.notificationLog.create({
            data: {
              channel: NotificationChannel.WEB_PUSH,
              recipient: customer.phoneE164,
              type: 'PAYMENT_DUE_REMINDER',
              referenceType: 'PAYMENT_SCHEDULE',
              referenceId: sched.id,
              status: NotificationStatus.PROCESSING,
              scheduledFor: sched.dueDate,
            },
          });
          logId = createdLog.id;
        }

        try {
          // Send Web Push to all Admin Subscriptions
          const adminSubscriptions = await this.prisma.pushSubscription.findMany();
          const pushPayload = JSON.stringify({
            title: "Nasiya To'lov Eslatmasi",
            body: `${customer.fullName}: ${amountDue.toLocaleString('uz-UZ')} UZS to'lov kuni ertaga (${sched.dueDate.toISOString().substring(0, 10)})`,
            url: '/installments',
          });

          for (const sub of adminSubscriptions) {
            try {
              await webPush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth,
                  },
                },
                pushPayload,
              );
            } catch (err: any) {
              if (err.statusCode === 410 || err.statusCode === 404) {
                this.logger.warn(`Push subscription expired/invalid. Removing ${sub.id}...`);
                await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
              } else {
                this.logger.error(`Failed to send web push to ${sub.endpoint}:`, err);
              }
            }
          }

          // Call SMS Provider
          await this.smsProvider.sendDueReminder(
            customer.phoneE164,
            customer.fullName,
            amountDue,
            sched.dueDate,
          );

          // Mark log as SENT
          if (logId) {
            await this.prisma.notificationLog.update({
              where: { id: logId },
              data: {
                status: NotificationStatus.SENT,
                sentAt: new Date(),
              },
            });
          }
        } catch (err: any) {
          this.logger.error(`Error sending reminder for schedule ${sched.id}:`, err);
          if (logId) {
            await this.prisma.notificationLog.update({
              where: { id: logId },
              data: { status: NotificationStatus.FAILED },
            });
          }
        }
      }
    } catch (error: any) {
      this.logger.error('Error during checkAndSendDueReminders execution:', error);
    }
  }
}
