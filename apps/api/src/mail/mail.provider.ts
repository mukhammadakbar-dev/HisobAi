import { Injectable, Logger } from '@nestjs/common';

/**
 * Email porti (§2.5, `ARCHITECTURE.md` §3).
 *
 * Provider hali tanlanmagan (`DECISIONS.md` ochiq savollar: Gmail
 * app-parol / Resend / Brevo). Port shu sabab hozirdan qo'yiladi:
 * tanlov qilinganda faqat bitta adapter qo'shiladi, chaqiruv joylari
 * o'zgarmaydi.
 */
export abstract class MailProvider {
  abstract sendPasswordReset(to: string, resetUrl: string): Promise<void>;
}

/**
 * Development adapteri: havolani logga chiqaradi.
 *
 * §2.6 — SMTP ulangunicha zaxira yo'l shu: ega logdagi havolani ochadi.
 * Undan ham ishonchli zaxira — `set-password` server komandasi.
 */
@Injectable()
export class ConsoleMailProvider extends MailProvider {
  private readonly logger = new Logger('Mail');

  sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    this.logger.log(`Parol tiklash havolasi (${to}): ${resetUrl}`);
    return Promise.resolve();
  }
}
