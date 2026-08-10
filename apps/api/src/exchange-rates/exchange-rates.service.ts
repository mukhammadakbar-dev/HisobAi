import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ErrorCode,
  ExchangeRateSource,
  RateStaleness,
  computeStoreRate,
  rateStaleness,
} from '@hisobai/contracts';
import type {
  ExchangeRateDto,
  ExchangeRateQuery,
  TodayExchangeRateDto,
  UpsertExchangeRateInput,
} from '@hisobai/contracts';
import { Prisma, type ExchangeRate } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { daysBetween, fromCalendarDate, toCalendarDate, today } from '../common/dates';
import type { RequestUser } from '../common/request-user';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CbuRateProvider } from './cbu-rate.provider';

export type SyncOutcome = 'WRITTEN' | 'MANUAL_PRESERVED';

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly settings: SettingsService,
    private readonly cbu: CbuRateProvider,
    private readonly audit: AuditService,
  ) {}

  private get timeZone(): string {
    return this.config.get('TIMEZONE', { infer: true });
  }

  // ──────────────────────────── O'qish ────────────────────────────

  /**
   * §17.11 — hodisa sanasidagi kurs.
   *
   * O'sha kun uchun qator bo'lmasa, **undan oldingi eng yaqin** qator
   * olinadi. Keyingi kun kursini olish mumkin emas: orqaga qo'yilgan
   * savdo o'sha kunda mavjud bo'lmagan kurs bilan yozilardi.
   */
  async getForDate(date: string): Promise<ExchangeRate | null> {
    return this.prisma.exchangeRate.findFirst({
      where: { date: { lte: fromCalendarDate(date) } },
      orderBy: { date: 'desc' },
    });
  }

  /** Savdo va to'lov moduli uchun: kurs yo'q bo'lsa aniq xato (§1.5 UI tomonda hal qilinadi). */
  async requireForDate(date: string): Promise<ExchangeRate> {
    const rate = await this.getForDate(date);
    if (!rate) {
      throw AppException.rule(
        ErrorCode.EXCHANGE_RATE_MISSING,
        "Bu sana uchun valyuta kursi yo'q. Sozlamalarda kursni kiriting.",
      );
    }
    return rate;
  }

  /**
   * §16.6 — eskirganlik: bugungi sana uchun qator yo'qmi.
   *
   * §1.5, §3.4 — kurs eskirsa savdo TO'XTAMAYDI. Shu sabab bu yerda
   * xato tashlanmaydi: oxirgi ma'lum kurs qaytariladi va UI tepada
   * ogohlantirish chizig'ini ko'rsatadi.
   */
  async getToday(): Promise<TodayExchangeRateDto> {
    const todayDate = today(this.timeZone);
    const rate = await this.getForDate(todayDate);

    if (!rate) {
      return {
        today: todayDate,
        rate: null,
        isStale: true,
        staleDays: null,
        staleness: RateStaleness.CRITICAL,
      };
    }

    const staleDays = daysBetween(toCalendarDate(rate.date), todayDate);
    return {
      today: todayDate,
      rate: toDto(rate),
      isStale: staleDays > 0,
      staleDays,
      staleness: rateStaleness(staleDays),
    };
  }

  /** §3.5 — kurs tarixi. */
  async list(query: ExchangeRateQuery): Promise<ExchangeRateDto[]> {
    const where: Prisma.ExchangeRateWhereInput = {};
    if (query.from ?? query.to) {
      where.date = {
        ...(query.from ? { gte: fromCalendarDate(query.from) } : {}),
        // `API.md` §5.2 — ikkala chekka ham kiritiladi
        ...(query.to ? { lte: fromCalendarDate(query.to) } : {}),
      };
    }

    const rows = await this.prisma.exchangeRate.findMany({
      where,
      orderBy: { date: 'desc' },
      take: query.limit ?? 60,
    });
    return rows.map(toDto);
  }

  // ──────────────────────────── Yozish ────────────────────────────

  /**
   * §16.8 — qo'lda qo'yilgan kurs.
   *
   * `source = MANUAL` bo'lgach, CBU sync `storeRate` ni **hech qachon**
   * ustidan yozmaydi. Zarar assimetriyasi shuni talab qiladi: cron odam
   * qarorini bekor qilsa, ega buni sezmaydi; bekor qilmasa — ko'radi va
   * o'zi hal qiladi.
   */
  async upsertManual(
    date: string,
    input: UpsertExchangeRateInput,
    actor: RequestUser,
    ip: string | null,
  ): Promise<ExchangeRateDto> {
    const calendarDate = fromCalendarDate(date);

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.exchangeRate.findUnique({ where: { date: calendarDate } });

      const data = {
        storeRate: new Prisma.Decimal(input.storeRate),
        cbuRate: input.cbuRate === undefined ? undefined : toDecimalOrNull(input.cbuRate),
        source: ExchangeRateSource.MANUAL,
        updatedById: actor.id,
      };

      const saved = await tx.exchangeRate.upsert({
        where: { date: calendarDate },
        update: data,
        create: { date: calendarDate, ...data, storeRate: new Prisma.Decimal(input.storeRate) },
      });

      // §3.10 — kurs o'zgarishi audit'ga: kim, qachon, nimadan nimaga
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'EXCHANGE_RATE_UPDATED',
        entityType: 'ExchangeRate',
        entityId: saved.id,
        before: before ? toDto(before) : null,
        after: toDto(saved),
        ip,
      });

      return toDto(saved);
    });
  }

  /**
   * §16.8 — "CBU kursiga qaytarish".
   *
   * `upsertManual` ning teskarisi va uning **majburiy jufti**: qo'lda
   * qo'yilgan kurs `source = MANUAL` bo'lib qoladi va cron unga boshqa
   * tegmaydi. Bu amal bo'lmasa `MANUAL` — chiqish yo'li yo'q o'lik holat:
   * ega bir marta kurs kiritsa, o'sha kun uchun avtomatik yangilanish
   * butunlay to'xtardi va buni faqat bazadan tuzatish mumkin bo'lardi.
   *
   * Do'kon kursi qaytadan **ustama formulasi** bilan hisoblanadi (§16.2),
   * ya'ni natija cron yozadigan qiymat bilan aynan bir xil bo'ladi.
   *
   * `source` allaqachon `CBU` bo'lsa ham ishlaydi: bu holda amal
   * "ustama o'zgardi, qayta hisobla" ma'nosini beradi va zarar keltirmaydi.
   */
  async resetToCbu(date: string, actor: RequestUser, ip: string | null): Promise<ExchangeRateDto> {
    const calendarDate = fromCalendarDate(date);
    const settings = await this.settings.get();

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.exchangeRate.findUnique({ where: { date: calendarDate } });

      if (!before) {
        throw AppException.notFound(
          ErrorCode.EXCHANGE_RATE_MISSING,
          "Bu sana uchun kurs qatori yo'q.",
        );
      }

      if (before.cbuRate === null) {
        // Qaytariladigan asos yo'q — jimgina nolga tushirib qo'yish
        // savdo narxlarini buzardi
        throw AppException.rule(
          ErrorCode.EXCHANGE_RATE_CBU_MISSING,
          "Bu sana uchun CBU kursi olinmagan — qaytarish uchun asos yo'q.",
        );
      }

      const storeRate = computeStoreRate(
        before.cbuRate.toString(),
        settings.storeRateMarkupPercent,
      );

      const saved = await tx.exchangeRate.update({
        where: { date: calendarDate },
        data: {
          storeRate: new Prisma.Decimal(storeRate),
          source: ExchangeRateSource.CBU,
          updatedById: actor.id,
        },
      });

      // §3.10 — kurs o'zgarishi audit'ga yoziladi
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'EXCHANGE_RATE_RESET_TO_CBU',
        entityType: 'ExchangeRate',
        entityId: saved.id,
        before: toDto(before),
        after: toDto(saved),
        ip,
      });

      return toDto(saved);
    });
  }

  /**
   * CBU kursini olib, do'kon kursini hisoblab yozadi (§3.3, §16.2).
   *
   * Ikki chaqiruvchisi bor va ular AYNAN bir xil kodni ishlatadi (§18.4):
   *  - **09:00 cron** — `context` yo'q, audit yozilmaydi (tizim amali);
   *  - **kun davomida qo'lda yangilash** — `context` bor, §3.10 bo'yicha
   *    audit yoziladi.
   *
   * Ikkinchisini alohida yozmaslik ataylab: mantiq ikkiga bo'linsa,
   * §16.8 himoyasi bitta yo'lda unutilishi mumkin edi.
   *
   * Xato **tashlanadi**: cron uni tutib qayta urinish jadvalini yuritadi
   * (§16.7), HTTP qatlami esa `503` ga aylantiradi.
   */
  async syncFromCbu(context?: {
    actor: RequestUser;
    ip: string | null;
  }): Promise<{ outcome: SyncOutcome; rate: ExchangeRateDto }> {
    const fetched = await this.fetchOrFail();
    const todayDate = today(this.timeZone);
    const calendarDate = fromCalendarDate(todayDate);

    const existing = await this.prisma.exchangeRate.findUnique({ where: { date: calendarDate } });

    // §16.8 — qo'lda qo'yilgan kursga tegilmaydi; CBU qiymati faqat
    // ma'lumot uchun yangilanadi. Qoida qo'lda yangilashda ham amal
    // qiladi: ega CBU'ni ko'rishni so'radi, do'kon kursini almashtirishni
    // emas — buning uchun alohida "CBU kursiga qaytarish" amali bor.
    if (existing?.source === ExchangeRateSource.MANUAL) {
      const preserved = await this.prisma.exchangeRate.update({
        where: { date: calendarDate },
        data: { cbuRate: new Prisma.Decimal(fetched.rate), fetchedAt: new Date() },
      });
      this.logger.log(
        `CBU kursi yangilandi, do'kon kursi qo'lda qo'yilgani uchun saqlandi (§16.8)`,
      );
      await this.auditSync(context, existing, preserved);
      return { outcome: 'MANUAL_PRESERVED', rate: toDto(preserved) };
    }

    const settings = await this.settings.get();
    const storeRate = computeStoreRate(fetched.rate, settings.storeRateMarkupPercent);
    const data = {
      cbuRate: new Prisma.Decimal(fetched.rate),
      storeRate: new Prisma.Decimal(storeRate),
      source: ExchangeRateSource.CBU,
      fetchedAt: new Date(),
    };

    const saved = await this.prisma.exchangeRate.upsert({
      where: { date: calendarDate },
      update: data,
      create: { date: calendarDate, ...data },
    });

    this.logger.log(`Kurs yozildi: CBU ${fetched.rate} → do'kon ${storeRate}`);
    await this.auditSync(context, existing, saved);
    return { outcome: 'WRITTEN', rate: toDto(saved) };
  }

  /**
   * Tashqi manba xatosini tipli holatga keltiradi.
   *
   * Xom `Error` HTTP qatlamida `500 INTERNAL_ERROR` bo'lib chiqardi — bu
   * yolg'on: server sog'lom, javob bermayotgani CBU. `503` esa
   * `Retry-After` bilan keladi (`API.md` §9) va §1.5 ga mos — oxirgi
   * ma'lum kurs o'z joyida qoladi, savdo to'xtamaydi.
   */
  private async fetchOrFail(): Promise<{ rate: string }> {
    try {
      return await this.cbu.fetchUsdRate();
    } catch (error) {
      this.logger.warn(
        `CBU manbasi javob bermadi: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new AppException(
        ErrorCode.EXCHANGE_RATE_FETCH_FAILED,
        "CBU javob bermadi. Oxirgi ma'lum kurs saqlanib qoldi — birozdan keyin urinib ko'ring.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /** §3.10 — faqat odam boshlagan yangilash audit'ga tushadi. */
  private async auditSync(
    context: { actor: RequestUser; ip: string | null } | undefined,
    before: ExchangeRate | null,
    after: ExchangeRate,
  ): Promise<void> {
    if (!context) return;

    await this.audit.recordDetached({
      actorId: context.actor.id,
      action: 'EXCHANGE_RATE_SYNCED',
      entityType: 'ExchangeRate',
      entityId: after.id,
      before: before ? toDto(before) : null,
      after: toDto(after),
      ip: context.ip,
    });
  }

  /** Bugun uchun qator bormi — startup catch-up qarori uchun (§16.7). */
  async hasRateForToday(): Promise<boolean> {
    const count = await this.prisma.exchangeRate.count({
      where: { date: fromCalendarDate(today(this.timeZone)) },
    });
    return count > 0;
  }
}

function toDecimalOrNull(value: string | null): Prisma.Decimal | null {
  return value === null ? null : new Prisma.Decimal(value);
}

function toDto(rate: ExchangeRate): ExchangeRateDto {
  return {
    id: rate.id,
    // `@db.Date` — UTC bo'yicha o'qiladi, aks holda sana bir kun sakraydi
    date: toCalendarDate(rate.date),
    cbuRate: rate.cbuRate?.toString() ?? null,
    storeRate: rate.storeRate.toString(),
    source: rate.source,
    fetchedAt: rate.fetchedAt?.toISOString() ?? null,
    updatedById: rate.updatedById,
    updatedAt: rate.updatedAt.toISOString(),
  };
}
