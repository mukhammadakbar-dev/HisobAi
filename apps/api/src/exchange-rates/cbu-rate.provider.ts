import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';

export interface CbuRate {
  /** 1 USD necha UZS — satr, float emas. */
  rate: string;
  /** CBU e'lon qilgan sana, `YYYY-MM-DD`. */
  date: string;
}

/**
 * CBU kursi porti (§3.3, `ARCHITECTURE.md` §3).
 *
 * Adapter ortida turishining sababi: `DECISIONS.md` ochiq savollarida
 * CBU endpointining aniq formati hali tasdiqlanmagan. Format o'zgarsa
 * yoki boshqa manbaga o'tilsa, faqat shu fayl o'zgaradi.
 */
export abstract class CbuRateProvider {
  abstract fetchUsdRate(): Promise<CbuRate>;
}

/** CBU javobidagi bitta valyuta yozuvi — faqat kerakli maydonlar. */
interface CbuEntry {
  Ccy?: unknown;
  Rate?: unknown;
  Date?: unknown;
}

const REQUEST_TIMEOUT_MS = 15_000;

@Injectable()
export class HttpCbuRateProvider extends CbuRateProvider {
  private readonly logger = new Logger('CbuRate');

  constructor(private readonly config: ConfigService<Env, true>) {
    super();
  }

  async fetchUsdRate(): Promise<CbuRate> {
    const url = this.config.get('CBU_API_URL', { infer: true });

    /**
     * Timeout majburiy: javob bermayotgan tashqi servis fon jarayonini
     * cheksiz ushlab turishi mumkin. §1.5 — kurs olinmasa ilova
     * to'xtamaydi, shuning uchun tez taslim bo'lish to'g'ri xulq.
     */
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`CBU javobi ${String(response.status)}`);
    }

    const payload: unknown = await response.json();
    const entries: CbuEntry[] = Array.isArray(payload)
      ? (payload as CbuEntry[])
      : [payload as CbuEntry];

    const usd = entries.find((entry) => String(entry.Ccy).toUpperCase() === 'USD');
    if (!usd) {
      throw new Error("CBU javobida USD kursi yo'q");
    }

    const rate = String(usd.Rate ?? '').trim();
    if (!/^\d+(\.\d+)?$/.test(rate) || Number(rate) <= 0) {
      throw new Error(`CBU kursi noto'g'ri: ${rate}`);
    }

    const date = parseCbuDate(usd.Date);
    this.logger.debug(`CBU kursi olindi: ${rate} (${date ?? 'sanasiz'})`);

    return { rate, date: date ?? '' };
  }
}

/**
 * CBU sanani `dd.mm.yyyy` ko'rinishida beradi. Boshqa formatga o'tsa
 * `null` qaytariladi — sana ikkinchi darajali ma'lumot, uning yo'qligi
 * kursni yozishga to'sqinlik qilmaydi.
 */
function parseCbuDate(value: unknown): string | null {
  const text = String(value ?? '').trim();
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  if (match) return `${match[3] ?? ''}-${match[2] ?? ''}-${match[1] ?? ''}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return null;
}
