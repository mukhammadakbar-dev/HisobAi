import { z } from 'zod';

import type { Currency } from '../enums';
import { calendarDate, pageQueryFields, uuidString } from './common';

/**
 * Hisobotlar (§13).
 *
 * **Hisobot saqlanmaydi — har safar hisoblanadi** (§13.10). Saqlansa,
 * savdo qaytarilganda eski hisobot noto'g'ri bo'lib qolardi va uni
 * qayta hisoblaydigan jarayon kerak bo'lardi. Shuning uchun bu yerda
 * hech qanday "hisobotni saqlash" sxemasi yo'q va bo'lmaydi.
 *
 * Barcha summalar **bazaviy valyutada** (UZS, §1.1): hisobot ikki
 * valyutani aralashtirib ko'rsatsa, jamini o'qib bo'lmasdi. Aylantirish
 * **savdo paytidagi snapshot kursda** (§5.9) — o'tgan davr hisoboti
 * bugungi kurs o'zgarganda o'zgarmasligi kerak.
 */

/**
 * Davr (§13.9).
 *
 * `from` va `to` — **kalendar sanalar** va ikkalasi ham davrga KIRADI
 * (`to` inklyuziv). Sabab foydalanuvchida: "1-avgustdan 31-avgustgacha"
 * degan oraliqda 31-avgust ham bo'lishi kutiladi. Eksklyuziv chegara
 * texnik jihatdan qulayroq, lekin ekranda uni tushuntirib bo'lmaydi.
 */
export const reportPeriodSchema = z
  .object({
    from: calendarDate,
    to: calendarDate,
  })
  .strict()
  .refine((period) => period.from <= period.to, {
    message: 'Boshlanish sanasi tugash sanasidan keyin bo‘lmasin',
    path: ['from'],
  });
export type ReportPeriod = z.infer<typeof reportPeriodSchema>;

/**
 * Dinamika qadami (§13.6).
 *
 * Server tanlamaydi — foydalanuvchi so'raydi: bir oylik davrni kunlik
 * ko'rish ham, haftalik ko'rish ham to'g'ri va bu tanlovni "aqlli"
 * qilib yashirish grafikni kutilmaganda o'zgartirib turardi.
 */
export const reportGranularitySchema = z.enum(['day', 'week', 'month']).default('day');
export type ReportGranularity = z.infer<typeof reportGranularitySchema>;

export const reportSeriesQuerySchema = z
  .object({
    from: calendarDate,
    to: calendarDate,
    granularity: reportGranularitySchema,
  })
  .strict()
  .refine((period) => period.from <= period.to, {
    message: 'Boshlanish sanasi tugash sanasidan keyin bo‘lmasin',
    path: ['from'],
  });
export type ReportSeriesQuery = z.infer<typeof reportSeriesQuerySchema>;

export const topProductsQuerySchema = z
  .object({
    from: calendarDate,
    to: calendarDate,
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict()
  .refine((period) => period.from <= period.to, {
    message: 'Boshlanish sanasi tugash sanasidan keyin bo‘lmasin',
    path: ['from'],
  });
export type TopProductsQuery = z.infer<typeof topProductsQuerySchema>;

// ──────────────────────────────── Javoblar ────────────────────────────────

/**
 * Ko'rsatkich va uning oldingi davr bilan solishtiruvi (§13.5).
 *
 * `changePercent` **`null` bo'lishi mumkin**: oldingi davrda qiymat nol
 * bo'lsa, foiz o'zgarishi matematik jihatdan aniqlanmagan. Uni `0` yoki
 * `100` deb ko'rsatish yolg'on bo'lardi — ekran "—" chizadi.
 */
export interface ReportMetricDto {
  value: string;
  previous: string;
  changePercent: number | null;
}

/**
 * Foyda tuzilmasi (§13.3, §17.3, §17.12).
 *
 * Har satr alohida: "sof foyda 3 mln" degan bitta raqam savolga javob
 * bermaydi — ega qaysi xarajat qancha yeganini ko'rishi kerak.
 */
export interface ProfitBreakdownDto {
  /** §13.3 — sotuv − tannarx. Nasiya ustamasi bu yerga KIRMAYDI (§17.3). */
  grossProfit: ReportMetricDto;
  /** §9.4, §17.3 — nasiya ustamasi alohida daromad satri. */
  markupIncome: ReportMetricDto;
  /** §11 — kassadan chiqqan pul (boshlang'ich qoldiq va ayirboshlashsiz). */
  cashExpenses: ReportMetricDto;
  /**
   * §17.12 — pul bo'lmagan xarajatlar: shaxsiy foydalanish va ombor
   * yo'qotishlari, tannarx bo'yicha. Ular kassadan pul olib chiqmaydi,
   * lekin foydani kamaytiradi.
   */
  nonCashExpenses: ReportMetricDto;
  /** yalpi + ustama − kassa xarajatlari − pul bo'lmagan xarajatlar. */
  netProfit: ReportMetricDto;
}

export interface ReportSummaryDto {
  from: string;
  to: string;
  /** Oldingi davr — shu uzunlikdagi, bevosita oldin turgan oraliq. */
  previousFrom: string;
  previousTo: string;
  currency: Currency;
  revenue: ReportMetricDto;
  saleCount: ReportMetricDto;
  /** §13.1 — foyda savdo kunida tan olinadi, nasiyada ham. */
  profit: ProfitBreakdownDto;
}

/** §13.6 — dinamika grafigi uchun bitta nuqta. */
export interface ReportSeriesPointDto {
  /** Qadam boshi, `YYYY-MM-DD`. */
  date: string;
  revenue: string;
  profit: string;
  saleCount: number;
}

export interface ReportSeriesDto {
  from: string;
  to: string;
  granularity: ReportGranularity;
  currency: Currency;
  points: ReportSeriesPointDto[];
}

/** §13.7 — qaysi model qancha sotildi va qancha foyda keltirdi. */
export interface TopProductDto {
  productId: string;
  productName: string;
  quantity: number;
  revenue: string;
  profit: string;
}

export interface TopProductsDto {
  from: string;
  to: string;
  currency: Currency;
  products: TopProductDto[];
}

/**
 * §13.8 — qarzdorlar. **Muddati o'tganlar tepada.**
 *
 * `daysOverdue` serverda hisoblanadi (§9.8): "bugun" do'kon vaqt
 * zonasida aniqlanadi (§1.3) va brauzer zonasi undan farq qilishi
 * mumkin.
 */
export interface DebtorDto {
  contractId: string;
  customerId: string | null;
  customerName: string | null;
  saleNumber: string | null;
  currency: Currency;
  outstanding: string;
  /** Eng yaqin to'lanmagan qator sanasi. */
  nextDueDate: string | null;
  /** 0 — kechikmagan. */
  daysOverdue: number;
}

export interface DebtorsReportDto {
  /** Barcha qarzdorlarning qoldig'i, bazaviy valyutada jamlangan. */
  totalOutstanding: string;
  overdueCount: number;
  currency: Currency;
  debtors: DebtorDto[];
}

/**
 * §5.9 — ombor qiymati **bugungi do'kon kursida** baholanadi.
 *
 * Foyda hisobidan farqli: u savdo paytidagi snapshot kursda qoladi.
 * Ombor esa hali sotilmagan mol, ya'ni uning bugungi qiymati so'raladi.
 */
export interface InventoryValueDto {
  currency: Currency;
  /** Tannarx bo'yicha jami. */
  totalCost: string;
  serializedCount: number;
  batchQuantity: number;
  /** Kurs yo'q bo'lsa valyutali qism baholanmaydi — bu ochiq aytiladi. */
  rateMissing: boolean;
}

// ──────────────────────────────── Audit (§2.2) ────────────────────────────────

/**
 * Audit ko'rinishi — **faqat o'qish uchun** (`PERMISSIONS.md`: faqat
 * `SHOP_ADMIN`).
 *
 * Yozuvlar hech qachon o'zgartirilmaydi va o'chirilmaydi: `hisobai_app`
 * roli uchun `audit_logs` da `UPDATE` va `DELETE` **bazaning o'zida**
 * bekor qilingan (§12, §21.16). Shuning uchun bu yerda faqat so'rov
 * sxemasi bor.
 */
export const auditQuerySchema = z
  .object({
    /** `SALE_CONFIRMED`, `PAYMENT_REVERSED` va h.k. */
    action: z.string().trim().min(1).max(60).optional(),
    entityType: z.string().trim().min(1).max(40).optional(),
    entityId: uuidString.optional(),
    actorId: uuidString.optional(),
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    ...pageQueryFields,
  })
  .strict();
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export interface AuditLogDto {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorId: string | null;
  actorName: string | null;
  /**
   * O'zgarishning oldingi va keyingi holati. Ular **ixtiyoriy**: ba'zi
   * amallarda "oldin" degan holat umuman yo'q (yaratish), ba'zilarida
   * esa "keyin" yo'q (o'chirish).
   */
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}
