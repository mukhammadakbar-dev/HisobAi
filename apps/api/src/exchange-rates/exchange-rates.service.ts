import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ErrorCode,
  ExchangeRateSource,
  RateStaleness,
  rateStaleness,
} from '@hisobai/contracts';
import type {
  ExchangeRateDto,
  ExchangeRateQuery,
  TodayExchangeRateDto,
  UpsertExchangeRateInput,
} from '@hisobai/contracts';
import { Prisma, type CbuRate, type ShopExchangeRate } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { daysBetween, fromCalendarDate, toCalendarDate, today } from '../common/dates';
import type { RequestUser } from '../common/request-user';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { runWithShopScope } from '../database/shop-context';
import { ShopsService } from '../shops/shops.service';
import { CbuRateProvider, type CbuRate as ProviderCbuRate } from './cbu-rate.provider';

export type SyncOutcome = 'WRITTEN' | 'MANUAL_PRESERVED';

/**
 * Kurs (§3.1–§3.5, §14.6, §21.5) ikki jadvalga bo'lingan:
 *
 *  - `cbu_rates` — platforma darajasida, `date` bo'yicha unique, Shop
 *    konteksti YO'Q (`SHOP_SCOPE_EXEMPT_MODELS`, `prisma.service.ts`).
 *    Faqat CBU sync yozadi.
 *  - `shop_exchange_rates` — har Shop o'z qatoriga ega, `(shopId, date)`
 *    unique, extension avtomatik joriy Shop bilan cheklaydi (§21.7).
 *
 * Servisning ikkita mustaqil "kirish nuqtasi" bor:
 *  1. **HTTP so'rov ichida** (deyarli hamma metod) — Shop konteksti
 *     `ShopContextInterceptor` orqali allaqachon ochiq, servis buni
 *     ambient deb qabul qiladi (`requireShopId()`, `this.shops.get()`).
 *  2. **Kunlik CRON fan-out** (`syncCbuAndFanOutToAllShops`) — HTTP
 *     so'rov yo'q, Shop konteksti yo'q. Bu yerda har Shop uchun
 *     `runWithShopScope(shop.id, …)` bilan ATAYLAB alohida vaqtinchalik
 *     kontekst ochiladi — xuddi `ShopContextInterceptor` bitta so'rov
 *     uchun qiladigani kabi, faqat bu yerda N marta, ketma-ket.
 *     `runWithoutShopScope()` BU YERDA ISHLATILMAYDI: u RLS'ni butunlay
 *     o'chirib qo'yardi va `shop_exchange_rates` yozuvi hech bir qatorga
 *     mos kelmay, jim ravishda hech narsa yozilmagan bo'lardi (§21.15) —
 *     bizga esa aksincha, HAR Shop uchun ALOHIDA, to'g'ri cheklangan
 *     kontekst kerak.
 */
@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly shops: ShopsService,
    private readonly cbu: CbuRateProvider,
    private readonly audit: AuditService,
  ) {}

  private get timeZone(): string {
    return this.config.get('TIMEZONE', { infer: true });
  }

  // ──────────────────────────── O'qish ────────────────────────────

  /**
   * §17.11 — hodisa sanasidagi **joriy Shop**ning kursi.
   *
   * O'sha kun uchun qator bo'lmasa, **undan oldingi eng yaqin** qator
   * olinadi. Keyingi kun kursini olish mumkin emas: orqaga qo'yilgan
   * savdo o'sha kunda mavjud bo'lmagan kurs bilan yozilardi.
   *
   * Faqat `.storeRate` kerak bo'lgan chaqiruvchilar uchun (savdo, hisobot)
   * — shuning uchun `CbuRate` bilan qo'shilmaydi, xom `ShopExchangeRate`
   * qaytadi.
   */
  async getForDate(date: string): Promise<ShopExchangeRate | null> {
    return this.prisma.shopExchangeRate.findFirst({
      where: { date: { lte: fromCalendarDate(date) } },
      orderBy: { date: 'desc' },
    });
  }

  /** Savdo va to'lov moduli uchun: kurs yo'q bo'lsa aniq xato (§1.5 UI tomonda hal qilinadi). */
  async requireForDate(date: string): Promise<ShopExchangeRate> {
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

    const cbuRate = await this.prisma.cbuRate.findUnique({ where: { date: rate.date } });
    const staleDays = daysBetween(toCalendarDate(rate.date), todayDate);
    return {
      today: todayDate,
      rate: toDto(rate, cbuRate),
      isStale: staleDays > 0,
      staleDays,
      staleness: rateStaleness(staleDays),
    };
  }

  /** §3.5 — kurs tarixi (joriy Shop). */
  async list(query: ExchangeRateQuery): Promise<ExchangeRateDto[]> {
    const where: Prisma.ShopExchangeRateWhereInput = {};
    if (query.from ?? query.to) {
      where.date = {
        ...(query.from ? { gte: fromCalendarDate(query.from) } : {}),
        // `API.md` §5.2 — ikkala chekka ham kiritiladi
        ...(query.to ? { lte: fromCalendarDate(query.to) } : {}),
      };
    }

    const rows = await this.prisma.shopExchangeRate.findMany({
      where,
      orderBy: { date: 'desc' },
      take: query.limit ?? 60,
    });
    if (rows.length === 0) return [];

    // Ro'yxatdagi har sana uchun CBU qatorini BITTA so'rovda olamiz —
    // sanalar soni bo'yicha N+1 emas
    const cbuRates = await this.prisma.cbuRate.findMany({
      where: { date: { in: rows.map((row) => row.date) } },
    });
    const cbuByDate = new Map(cbuRates.map((cbu) => [cbu.date.getTime(), cbu]));

    return rows.map((row) => toDto(row, cbuByDate.get(row.date.getTime()) ?? null));
  }

  // ──────────────────────────── Yozish ────────────────────────────

  /**
   * §16.8 — qo'lda qo'yilgan kurs (joriy Shop).
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
      const before = await tx.shopExchangeRate.findFirst({ where: { date: calendarDate } });

      const data: Prisma.ShopExchangeRateUncheckedUpdateInput = {
        storeRate: new Prisma.Decimal(input.storeRate),
        source: ExchangeRateSource.MANUAL,
        updatedById: actor.id,
      };

      // `id` bo'yicha `update`/`create` — `shopId_date` KOMPOZIT unique
      // kalitini qo'lda tuzish `shopId`ni qo'lda yozishni talab qilardi
      // (§21.7 aynan shuni taqiqlaydi). `findFirst` — RLS/extension
      // orqali allaqachon joriy Shop bilan cheklangan (§21.13), shuning
      // uchun bu yerda xavfsiz.
      const saved = before
        ? await tx.shopExchangeRate.update({ where: { id: before.id }, data })
        : await tx.shopExchangeRate.create({
            data: { date: calendarDate, ...data } as Prisma.ShopExchangeRateUncheckedCreateInput,
          });

      const cbuRate = await tx.cbuRate.findUnique({ where: { date: calendarDate } });

      // §3.10 — kurs o'zgarishi audit'ga: kim, qachon, nimadan nimaga
      await this.audit.record(tx, actor.shopId, {
        actorId: actor.id,
        action: 'EXCHANGE_RATE_UPDATED',
        entityType: 'ShopExchangeRate',
        entityId: saved.id,
        before: before ? toDto(before, cbuRate) : null,
        after: toDto(saved, cbuRate),
        ip,
      });

      return toDto(saved, cbuRate);
    });
  }

  /**
   * §16.8 — "CBU kursiga qaytarish" (joriy Shop).
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
    const shop = await this.shops.get();

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.shopExchangeRate.findFirst({ where: { date: calendarDate } });

      if (!before) {
        throw AppException.notFound(
          ErrorCode.EXCHANGE_RATE_MISSING,
          "Bu sana uchun kurs qatori yo'q.",
        );
      }

      const cbuRate = await tx.cbuRate.findUnique({ where: { date: calendarDate } });
      if (!cbuRate) {
        // Qaytariladigan asos yo'q — jimgina nolga tushirib qo'yish
        // savdo narxlarini buzardi
        throw AppException.rule(
          ErrorCode.EXCHANGE_RATE_CBU_MISSING,
          "Bu sana uchun CBU kursi olinmagan — qaytarish uchun asos yo'q.",
        );
      }

      const storeRate = cbuRate.rate.toString();

      const saved = await tx.shopExchangeRate.update({
        where: { id: before.id },
        data: {
          storeRate: new Prisma.Decimal(storeRate),
          source: ExchangeRateSource.CBU,
          updatedById: actor.id,
        },
      });

      // §3.10 — kurs o'zgarishi audit'ga yoziladi
      await this.audit.record(tx, actor.shopId, {
        actorId: actor.id,
        action: 'EXCHANGE_RATE_RESET_TO_CBU',
        entityType: 'ShopExchangeRate',
        entityId: saved.id,
        before: toDto(before, cbuRate),
        after: toDto(saved, cbuRate),
        ip,
      });

      return toDto(saved, cbuRate);
    });
  }

  /**
   * CBU kursini olib, **joriy Shop**ning kursini hisoblab yozadi
   * (§3.3, §16.2, §18.4).
   *
   * `POST /exchange-rates/sync` shu metodni chaqiradi: `cbu_rates` ni
   * (platforma darajasida) yangilaydi va so'rovchi Shop'ning kursini
   * qayta hisoblaydi. Boshqa Shop'larga tegmaydi — ularni yangilaydigan
   * yagona yo'l kunlik cron (`syncCbuAndFanOutToAllShops`).
   *
   * Xato **tashlanadi**: HTTP qatlami uni `503` ga aylantiradi.
   */
  async syncFromCbu(context: {
    actor: RequestUser;
    ip: string | null;
  }): Promise<{ outcome: SyncOutcome; rate: ExchangeRateDto }> {
    const cbuRate = await this.fetchAndStoreCbuRate();
    const shop = await this.shops.get();
    return this.applyCbuRateToShop(cbuRate, shop, context);
  }

  /**
   * §18.4, §16.7 — 09:00 kunlik CRON: `cbu_rates`ni BIR MARTA yangilaydi,
   * so'ng HAR bir Shop uchun kursini qayta hisoblaydi.
   *
   * Fan-out shu yerda, HTTP so'rovsiz sodir bo'ladi — Shop konteksti
   * ambient EMAS. Har Shop uchun `runWithShopScope(shop.id, …)` bilan
   * ALOHIDA vaqtinchalik kontekst ochiladi (yuqoridagi klass izohiga
   * qarang) — `ShopContextInterceptor`ning bitta HTTP so'rov uchun
   * qiladigan ishi shu yerda N marta, ketma-ket takrorlanadi.
   *
   * Bitta Shop'ning xatosi (masalan kutilmagan holat) qolganlarini
   * to'xtatmaydi — har biri mustaqil yoziladi, xato faqat log'ga tushadi.
   */
  async syncCbuAndFanOutToAllShops(): Promise<void> {
    const cbuRate = await this.fetchAndStoreCbuRate();

    // `Shop` — SHOP_SCOPE_EXEMPT model (`prisma.service.ts`), kontekstsiz
    // o'qish xavfsiz: bu yerda hali birorta Shop konteksti ochilmagan.
    const shops = await this.prisma.shop.findMany();

    for (const shop of shops) {
      try {
        await runWithShopScope(shop.id, () =>
          this.applyCbuRateToShop(cbuRate, {
            storeRateMarkupPercent: shop.storeRateMarkupPercent.toString(),
          }),
        );
      } catch (error) {
        this.logger.warn(
          `Kurs qayta hisoblanmadi (Shop ${shop.id}): ${describeError(error)}`,
        );
      }
    }
  }

  /**
   * `cbu_rates`ni yangilaydi — platforma darajasida, BIR marta.
   *
   * Bu metod Shop kontekstiga MUHTOJ EMAS: `CbuRate` chiqarilgan model
   * (§14.6), shuning uchun HTTP so'rov ichidan ham (interaktiv sync),
   * konteksts CRON'dan ham xavfsiz chaqiriladi.
   */
  private async fetchAndStoreCbuRate(): Promise<ProviderCbuRate> {
    const fetched = await this.fetchOrFail();
    const todayDate = today(this.timeZone);
    const calendarDate = fromCalendarDate(todayDate);

    const saved = await this.prisma.cbuRate.upsert({
      where: { date: calendarDate },
      update: { rate: new Prisma.Decimal(fetched.rate), fetchedAt: new Date() },
      create: {
        date: calendarDate,
        rate: new Prisma.Decimal(fetched.rate),
        fetchedAt: new Date(),
      },
    });

    this.logger.log(`CBU kursi yozildi: ${saved.rate.toString()} (${todayDate})`);
    return {
      rate: fetched.rate,
      sellRate: fetched.sellRate,
      date: todayDate,
    };
  }

  /**
   * Bitta Shop'ning kursini `cbuRate`dan qayta hisoblaydi (§16.2, §16.8).
   *
   * **Chaqiruvchi Shop kontekstini ochgan bo'lishi SHART** — HTTP yo'lida
   * `ShopContextInterceptor`, fan-out yo'lida `runWithShopScope` (yuqoriga
   * qarang). Bu funksiya buni o'zi ochmaydi: ikkita chaqiruvchisi bitta
   * mantiqni ulashishi kerak, konteks ochish esa ularning har birida
   * BOSHQACHA (bittasi — mavjud so'rov konteksti, ikkinchisi — yangi
   * vaqtinchalik).
   */
  private async applyCbuRateToShop(
    cbuRate: ProviderCbuRate,
    // Ikkita chaqiruvchi ikki xil shakl bilan keladi: `ShopDto` (satr,
    // `API.md` §2.1) va xom Prisma `Shop` (`Decimal`) — shu sabab bu yerda
    // faqat kerakli maydon, ikkalasi ham ishlata oladigan umumiy shaklda.
    shop: { storeRateMarkupPercent: string },
    context?: { actor: RequestUser; ip: string | null },
  ): Promise<{ outcome: SyncOutcome; rate: ExchangeRateDto }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.shopExchangeRate.findFirst({ where: { date: cbuRate.date } });

      // §16.8 — qo'lda qo'yilgan kursga tegilmaydi. Qoida qo'lda
      // yangilashda ham amal qiladi: ega CBU'ni ko'rishni so'radi, do'kon
      // kursini almashtirishni emas — buning uchun alohida "CBU kursiga
      // qaytarish" amali bor.
      if (existing?.source === ExchangeRateSource.MANUAL) {
        this.logger.log("Do'kon kursi qo'lda qo'yilgani uchun saqlandi (§16.8)");
        await this.auditSync(context, existing, existing, cbuRate);
        return { outcome: 'MANUAL_PRESERVED', rate: toDto(existing, cbuRate) };
      }

      const storeRate = cbuRate.sellRate ?? cbuRate.rate;
      const data: Prisma.ShopExchangeRateUncheckedUpdateInput = {
        storeRate: new Prisma.Decimal(storeRate),
        source: ExchangeRateSource.CBU,
      };

      const saved = existing
        ? await tx.shopExchangeRate.update({ where: { id: existing.id }, data })
        : await tx.shopExchangeRate.create({
            data: {
              date: cbuRate.date,
              ...data,
            } as Prisma.ShopExchangeRateUncheckedCreateInput,
          });

      this.logger.log(`Kurs yozildi: CBU ${cbuRate.rate.toString()} → do'kon ${storeRate}`);
      await this.auditSync(context, existing, saved, cbuRate);
      return { outcome: 'WRITTEN', rate: toDto(saved, cbuRate) };
    });
  }

  /**
   * Tashqi manba xatosini tipli holatga keltiradi.
   *
   * Xom `Error` HTTP qatlamida `500 INTERNAL_ERROR` bo'lib chiqardi — bu
   * yolg'on: server sog'lom, javob bermayotgani CBU. `503` esa
   * `Retry-After` bilan keladi (`API.md` §9) va §1.5 ga mos — oxirgi
   * ma'lum kurs o'z joyida qoladi, savdo to'xtamaydi.
   */
  private async fetchOrFail(): Promise<ProviderCbuRate> {
    try {
      return await this.cbu.fetchUsdRate();
    } catch (error) {
      this.logger.warn(`CBU manbasi javob bermadi: ${describeError(error)}`);
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
    before: ShopExchangeRate | null,
    after: ShopExchangeRate,
    cbuRate: ProviderCbuRate | CbuRate,
  ): Promise<void> {
    if (!context) return;

    await this.audit.recordDetached(context.actor.shopId, {
      actorId: context.actor.id,
      action: 'EXCHANGE_RATE_SYNCED',
      entityType: 'ShopExchangeRate',
      entityId: after.id,
      before: before ? toDto(before, cbuRate) : null,
      after: toDto(after, cbuRate),
      ip: context.ip,
    });
  }

  /**
   * Bugun uchun CBU qatori bormi — startup catch-up qarori uchun (§16.7).
   *
   * `cbu_rates` tekshiriladi, `shop_exchange_rates` emas: bu CRON'dan
   * (HTTP so'rovsiz, Shop kontekstisiz) chaqiriladi, va CBU — chiqarilgan,
   * Shop'dan mustaqil model (§14.6). Shop kurslari CBU'dan hosila bo'lgani
   * uchun "CBU bormi" savoli yetarli.
   */
  async hasRateForToday(): Promise<boolean> {
    const count = await this.prisma.cbuRate.count({
      where: { date: fromCalendarDate(today(this.timeZone)) },
    });
    return count > 0;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toDto(
  rate: ShopExchangeRate,
  cbuRate: CbuRate | ProviderCbuRate | null,
): ExchangeRateDto {
  const cbuRateStr =
    cbuRate === null
      ? null
      : typeof cbuRate.rate === 'object' && cbuRate.rate !== null
        ? cbuRate.rate.toString()
        : String(cbuRate.rate);
  const fetchedAtIso =
    cbuRate === null
      ? null
      : 'fetchedAt' in cbuRate && cbuRate.fetchedAt instanceof Date
        ? cbuRate.fetchedAt.toISOString()
        : new Date().toISOString();

  return {
    id: rate.id,
    date: toCalendarDate(rate.date),
    cbuRate: cbuRateStr,
    storeRate: rate.storeRate.toString(),
    source: rate.source,
    fetchedAt: fetchedAtIso,
    updatedById: rate.updatedById,
    updatedAt: rate.updatedAt.toISOString(),
  };
}
