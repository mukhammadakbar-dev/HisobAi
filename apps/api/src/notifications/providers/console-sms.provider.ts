import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider } from '../interfaces/sms-provider.interface';

@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger(ConsoleSmsProvider.name);

  async sendDueReminder(
    phone: string,
    customerName: string,
    amount: number,
    dueDate: Date,
  ): Promise<boolean> {
    const formattedDate = dueDate.toISOString().substring(0, 10);
    const formattedAmount = amount.toLocaleString('uz-UZ');

    this.logger.log(
      `[CONSOLE SMS PROVIDER] 📱 Sent SMS to ${phone} (${customerName}): "Hurmatli ${customerName}, sizning ${formattedAmount} UZS to'lovingiz muddati ertaga (${formattedDate}) yetib keladi."`,
    );

    return true;
  }
}
