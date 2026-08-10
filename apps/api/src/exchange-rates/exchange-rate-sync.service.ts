import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { hourInTimeZone, nextOccurrenceOfHour } from '../common/dates';
import type { Env } from '../config/env';
import { ExchangeRatesService } from './exchange-rates.service';

/**
 * §16.7 — qayta urinish jadvali: 09:00 → +15 daqiqa → +1 soat → +3 soat.
 * Jami 4 urinish, keyin ertangi kungacha kutiladi.
 *
 * Cheksiz retry keraksiz: §1.5 ilova kurssiz ham ishlashini kafolatlaydi,
 * UI esa eskirgan kursni ochiq ko'rsatadi (§16.6).
 */
const RETRY_DELAYS_MS = [15 * 60 * 1000, 60 * 60 * 1000, 3 * 60 * 60 * 1000];

/**
 * CBU kursini kunlik olib turuvchi fon jarayoni (`ARCHITECTURE.md` §10).
 *
 * Nega tayyor cron kutubxonasi emas: kerakli xulq "har kuni 09:00" dan
 * iborat emas — unga qayta urinish zinapoyasi va server ishga
 * tushgandagi ilib olish qo'shiladi. Ikkalasi baribir qo'lda yozilardi,
 * qolgan qismi esa `nextOccurrenceOfHour` — sinalgan 20 qator kod.
 */
@Injectable()
export class ExchangeRateSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ExchangeRateSync');
  private readonly timers = new Set<NodeJS.Timeout>();
  private stopped = false;

  constructor(
    private readonly rates: ExchangeRatesService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    this.scheduleNextDailyRun();
    void this.catchUpOnStartup();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  /**
   * Server 09:00 dan keyin ko'tarilgan bo'lsa va bugungi kurs yo'q bo'lsa,
   * darhol bitta urinish qilinadi (§16.7).
   *
   * Usiz kechqurun qayta ishga tushirilgan server ertasi ertalabgacha
   * kurssiz qolardi.
   */
  private async catchUpOnStartup(): Promise<void> {
    try {
      const syncHour = this.config.get('RATE_SYNC_HOUR', { infer: true });
      const timeZone = this.config.get('TIMEZONE', { infer: true });

      if (hourInTimeZone(new Date(), timeZone) < syncHour) return;
      if (await this.rates.hasRateForToday()) return;

      this.logger.log('Ishga tushishda bugungi kurs topilmadi — olinmoqda');
      await this.run(0);
    } catch (error) {
      this.logger.warn(`Ishga tushishdagi kurs tekshiruvi xato berdi: ${describe(error)}`);
    }
  }

  private scheduleNextDailyRun(): void {
    if (this.stopped) return;

    const syncHour = this.config.get('RATE_SYNC_HOUR', { infer: true });
    const timeZone = this.config.get('TIMEZONE', { infer: true });
    const nextRun = nextOccurrenceOfHour(syncHour, timeZone);

    this.later(nextRun.getTime() - Date.now(), () => {
      void this.run(0);
      // Keyingi kunni darhol rejalashtiramiz — urinishlar natijasidan qat'i nazar
      this.scheduleNextDailyRun();
    });

    this.logger.log(`Keyingi kurs sinxronizatsiyasi: ${nextRun.toISOString()}`);
  }

  /** Bitta urinish; muvaffaqiyatsiz bo'lsa zinapoya bo'yicha qaytadan. */
  private async run(attempt: number): Promise<void> {
    if (this.stopped) return;

    try {
      // Cron `context` yubormaydi — bu tizim amali, audit'ga tushmaydi (§18.4)
      const { outcome } = await this.rates.syncFromCbu();
      this.logger.log(`Kurs sinxronizatsiyasi tugadi: ${outcome}`);
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt];

      if (delay === undefined) {
        // §1.5 — ilova to'xtamaydi: oxirgi ma'lum kurs ishlatiladi
        this.logger.error(
          `CBU kursi ${String(RETRY_DELAYS_MS.length + 1)} urinishdan keyin ham olinmadi. ` +
            `Oxirgi ma'lum kurs ishlatiladi. Sabab: ${describe(error)}`,
        );
        return;
      }

      this.logger.warn(
        `CBU kursi olinmadi (${String(attempt + 1)}-urinish): ${describe(error)}. ` +
          `${String(Math.round(delay / 60000))} daqiqadan keyin qayta uriniladi.`,
      );
      this.later(delay, () => void this.run(attempt + 1));
    }
  }

  private later(delayMs: number, action: () => void): void {
    const timer = setTimeout(
      () => {
        this.timers.delete(timer);
        action();
      },
      Math.max(0, delayMs),
    );

    // Fon taymeri jarayonni tirik ushlab turmasin — HTTP listener buni qiladi
    timer.unref();
    this.timers.add(timer);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
