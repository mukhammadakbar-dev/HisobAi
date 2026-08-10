import { Global, Module } from '@nestjs/common';

import { ConsoleMailProvider, MailProvider } from './mail.provider';

/**
 * `MAIL_PROVIDER` env qiymati adapterni tanlaydi (hozir faqat `console`).
 * SMTP tanlanganda shu yerga ikkinchi adapter qo'shiladi — chaqiruvchi
 * kod `MailProvider` abstraksiyasini ko'radi va o'zgarmaydi.
 */
@Global()
@Module({
  providers: [{ provide: MailProvider, useClass: ConsoleMailProvider }],
  exports: [MailProvider],
})
export class MailModule {}
