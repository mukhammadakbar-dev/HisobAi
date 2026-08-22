import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';

export interface CbuRate {
  /** Olish (Buy rate, e.g. 12700) */
  rate: string;
  /** Sotish (Sell rate, e.g. 12800) */
  sellRate?: string;
  /** YYYY-MM-DD */
  date: string;
}

/**
 * CBU / NBU kursi porti (§3.3, `ARCHITECTURE.md` §3).
 *
 * Adapter ortida turishining sababi: `DECISIONS.md` ochiq savollarida
 * CBU/NBU endpointining aniq formati hali tasdiqlanmagan. Format o'zgarsa
 * yoki boshqa manbaga o'tilsa, faqat shu fayl o'zgaradi.
 */
export abstract class CbuRateProvider {
  abstract fetchUsdRate(): Promise<CbuRate>;
}

/** NBU javobidagi bitta valyuta yozuvi. */
interface NbuEntry {
  title?: unknown;
  code?: unknown;
  cb_price?: unknown;
  nbu_buy_price?: unknown;
  nbu_cell_price?: unknown;
  date?: unknown;
}

/** CBU javobidagi bitta valyuta yozuvi — faqat kerakli maydonlar. */
interface CbuEntry {
  Ccy?: unknown;
  Rate?: unknown;
  Date?: unknown;
}

const REQUEST_TIMEOUT_MS = 15_000;
const NBU_API_URL = 'https://nbu.uz/uz/exchange-rates/json/';
const CBU_FALLBACK_URL = 'https://cbu.uz/uz/arkhiv-kursov-valyut/json/';

@Injectable()
export class HttpCbuRateProvider extends CbuRateProvider {
  private readonly logger = new Logger('CbuRate');

  constructor(private readonly config: ConfigService<Env, true>) {
    super();
  }

  async fetchUsdRate(): Promise<CbuRate> {
    const userAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    // 1. Try NBU exchange rates API first
    try {
      const response = await fetch(NBU_API_URL, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { accept: 'application/json', 'user-agent': userAgent },
      });

      if (response.ok) {
        const payload: unknown = await response.json();
        const entries: NbuEntry[] = Array.isArray(payload)
          ? (payload as NbuEntry[])
          : [payload as NbuEntry];

        const usd = entries.find(
          (entry) =>
            String(entry.code).toUpperCase() === 'USD' ||
            String(entry.title).toUpperCase() === 'USD',
        );

        if (usd) {
          const buyPrice = String(usd.nbu_buy_price ?? '').trim();
          const sellPrice = String(usd.nbu_cell_price ?? '').trim();
          const date = parseDate(usd.date);

          const buyNum = Number(buyPrice);
          const sellNum = Number(sellPrice);

          if (
            buyPrice &&
            sellPrice &&
            !Number.isNaN(buyNum) &&
            !Number.isNaN(sellNum) &&
            buyNum > 0 &&
            sellNum > 0 &&
            buyNum !== sellNum
          ) {
            this.logger.debug(
              `NBU kursi olindi: olish=${buyPrice}, sotish=${sellPrice} (${date ?? 'sanasiz'})`,
            );
            return {
              rate: buyPrice,
              sellRate: sellPrice,
              date: date ?? '',
            };
          }
        }
      }
    } catch (error) {
      this.logger.warn(
        `NBU kursi olinmadi, CBU'ga o'tilmoqda: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 2. Fallback to CBU API
    const url = this.config.get('CBU_API_URL', { infer: true }) || CBU_FALLBACK_URL;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: 'application/json', 'user-agent': userAgent },
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

    const rawRate = String(usd.Rate ?? '').trim();
    if (!/^\d+(\.\d+)?$/.test(rawRate) || Number(rawRate) <= 0) {
      throw new Error(`CBU kursi noto'g'ri: ${rawRate}`);
    }

    const baseNum = Number(rawRate);
    // Realistik tijorat spredi (Olish: -50 so'm, Sotish: +50 so'm)
    const buyRate = Math.floor(baseNum - 50).toString();
    const sellRate = Math.ceil(baseNum + 50).toString();

    const date = parseDate(usd.Date);
    this.logger.debug(
      `CBU asosida kurslar shakllantirildi: olish=${buyRate}, sotish=${sellRate} (${date ?? 'sanasiz'})`,
    );

    return {
      rate: buyRate,
      sellRate,
      date: date ?? '',
    };
  }
}

/**
 * Sanani `YYYY-MM-DD` ko'rinishiga keltiradi.
 * `dd.mm.yyyy`, `dd.mm.yyyy hh:mm:ss`, yoki `yyyy-mm-dd` formatlarini qabul qiladi.
 */
function parseDate(value: unknown): string | null {
  const text = String(value ?? '').trim();
  const match = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(text);
  if (match) return `${match[3] ?? ''}-${match[2] ?? ''}-${match[1] ?? ''}`;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (isoMatch) return `${isoMatch[1] ?? ''}-${isoMatch[2] ?? ''}-${isoMatch[3] ?? ''}`;
  return null;
}
