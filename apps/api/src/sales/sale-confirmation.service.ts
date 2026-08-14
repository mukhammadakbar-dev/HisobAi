import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ErrorCode,
  InventoryStatus,
  PaymentMethod,
  PaymentStatus,
  SaleKind,
  SaleStatus,
  StockMovementType,
  UserRole,
  markupFromPercent,
  multiplyMoney,
  principalOf,
  roundMoney,
  sumMoney,
  type ConfirmSaleInput,
  type InstallmentPlanInput,
  type Currency,
  type SaleDto,
  type SalePaymentInput,
} from '@hisobai/contracts';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { CashEntriesService } from '../cash/cash-entries.service';
import { AppException } from '../common/app.exception';
import { businessDay } from '../common/dates';
import type { RequestUser } from '../common/request-user';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { requireShopId } from '../database/shop-context';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { SALE_INCLUDE, toSaleDto, type SaleRow } from './sales.mappers';
import { MAX_BACKDATE_DAYS, assertDraft, convert, profitOf, saleNotFound } from './sales.service';

/**
 * Savdo tasdiqlash — **bitta tranzaksiya** (ARCHITECTURE §6).
 *
 * Ketma-ketlik hujjatdagi tartibda va u ataylab shunday:
 *
 *  1. ombor **shartli `UPDATE`** bilan band qilinadi (§17.5) — "birinchi
 *     tasdiqlagan oladi" aynan shu yerda hal bo'ladi;
 *  2. savdo raqami `sale_counters` dan ajratiladi (§17.1);
 *  3. savdo yangilanadi, snapshotlar qat'iylashadi (§7.11);
 *  4. ombor harakati yoziladi (§5.10);
 *  5. to'lovlar yaratiladi — naqd va karta darhol `CONFIRMED`,
 *     o'tkazma `PENDING_VERIFICATION` (§17.2);
 *  6. **faqat `CONFIRMED`** to'lovlar uchun kassa kirimi (§17.2);
 *  7. nasiya bo'lsa — shartnoma va to'lov jadvali (§9.1, §9.6);
 *  8. audit yozuvi.
 *
 * Bittasi xato bersa — hech biri saqlanmaydi.
 *
 * `SELECT` keyin `UPDATE` naqshi **ishlatilmaydi**: `READ COMMITTED` da
 * u ikki tranzaksiyaga bitta telefonni sotishga ruxsat berardi.
 */
@Injectable()
export class SaleConfirmationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: ExchangeRatesService,
    private readonly cashEntries: CashEntriesService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get timeZone(): string {
    return this.config.get('TIMEZONE', { infer: true });
  }

  async confirm(
    id: string,
    input: ConfirmSaleInput,
    actor: RequestUser,
    ip: string | null,
  ): Promise<SaleDto> {
    return this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.sale.findUnique({ where: { id }, include: SALE_INCLUDE });
        if (!sale) throw saleNotFound();
        assertDraft(sale.status);

        if (sale.items.length === 0) {
          throw AppException.rule(ErrorCode.SALE_EMPTY, "Savatga kamida bitta mahsulot qo'shing.");
        }

        // §9.1 — nasiya sharti savdoning TURIGA bog'liq, sxema esa turni
        // ko'rmaydi (u qoralamada saqlangan), shuning uchun tekshiruv shu yerda
        const plan = assertPlanMatchesKind(sale, input.installment);

        const soldAt = this.resolveSoldAt(input.soldAt, sale.soldAt);
        // §17.11 — savdo SANASIDAGI do'kon kursi, bugungisi emas:
        // orqaga qo'yilgan savdo o'sha kunning kursi bilan yozilishi kerak
        const rate = await this.rates.requireForDate(businessDay(soldAt, this.timeZone));
        const confirmedAt = new Date();

        // 1 — ombor va snapshotlar
        const lines = await this.reserveStock(tx, sale);
        const total = sumMoney(
          lines.map((line) => line.lineTotal),
          sale.currency,
        );

        // 2 — raqam (§7.6, §17.1)
        const number = await this.allocateNumber(tx, soldAt);

        // 3 — savdo qat'iylashadi
        const confirmed = await tx.sale.update({
          where: { id },
          data: {
            number,
            status: SaleStatus.CONFIRMED,
            exchangeRate: rate.storeRate,
            total: new Prisma.Decimal(total),
            soldAt,
            confirmedAt,
          },
          include: SALE_INCLUDE,
        });

        // 4 — ombor harakati (§5.10)
        await tx.stockMovement.createMany({
          data: lines.map((line) => ({
            productId: line.productId,
            inventoryItemId: line.inventoryItemId,
            batchId: line.batchId,
            type: StockMovementType.SALE,
            // Miqdor musbat: yo'nalishni `type` bildiradi (schema §5.10 izohi) —
            // qabulda ham shunday yozilgan, ikki xil ishora aralashmasin
            quantity: line.quantity,
            referenceType: 'SALE',
            referenceId: sale.id,
            occurredAt: soldAt,
            actorId: actor.id,
          })),
        });

        // 5 va 6 — to'lovlar va kassa. Naqd savdoda to'lovlar savdo
        // summasiga teng bo'lishi shart (§17.10), nasiyada esa —
        // BOSHLANG'ICH TO'LOVGA: qolgani jadval bo'yicha keyin keladi
        await this.recordPayments(tx, {
          sale: confirmed,
          payments: input.payments,
          expectedPaid: plan === null ? total : roundMoney(plan.downPayment, sale.currency),
          rate: rate.storeRate,
          soldAt,
          confirmedAt,
          actor,
        });

        // 7 — nasiya bo'lsa shartnoma va jadval (§9.1)
        const contract = plan
          ? await this.createContract(tx, { sale: confirmed, plan, total, soldAt })
          : null;

        // 8 — audit
        await this.audit.record(tx, actor.shopId, {
          actorId: actor.id,
          action: 'SALE_CONFIRMED',
          entityType: 'Sale',
          entityId: sale.id,
          before: { status: sale.status, total: sale.total },
          after: {
            number,
            status: SaleStatus.CONFIRMED,
            total,
            currency: sale.currency,
            exchangeRate: rate.storeRate,
            soldAt: soldAt.toISOString(),
            // §7.5 — orqaga qo'yilgan sana auditda ko'rinib tursin
            backdated:
              businessDay(soldAt, this.timeZone) !== businessDay(confirmedAt, this.timeZone),
            paymentCount: input.payments.length,
            // §9.1 — shartnoma savdo bilan bitta tranzaksiyada tug'iladi,
            // ya'ni audit yozuvi ham bitta bo'lishi kerak: ikkitaga
            // bo'linsa, ular orasida "shartnomasiz nasiya savdo" degan
            // holat bo'lgandek ko'rinardi
            contract:
              contract === null
                ? null
                : { id: contract.id, principal: contract.principal, currency: sale.currency },
          },
          ip,
        });

        const withPayments = await tx.sale.findUniqueOrThrow({
          where: { id },
          include: SALE_INCLUDE,
        });
        const showCost = actor.role === UserRole.SHOP_ADMIN;
        return toSaleDto(withPayments, {
          showCost,
          profit: showCost ? profitOf(withPayments) : null,
        });
      },
      // Katta savatda har qator uchun shartli `UPDATE` bo'ladi
      { timeout: 30_000 },
    );
  }

  // ──────────────────────── 1-qadam: ombor (§17.5) ────────────────────────

  /**
   * Har qator uchun shartli `UPDATE` va snapshotni qat'iylashtirish.
   *
   * `updateMany` ning `count` i — yagona ishonchli javob: 0 bo'lsa,
   * birlik shu oniyda boshqa savdoda ketgan. Xato matni ham shuni
   * aytadi, chunki foydalanuvchi uchun bu "tarmoq xatosi" emas —
   * savatdan qatorni olib tashlash kerak.
   */
  private async reserveStock(tx: Prisma.TransactionClient, sale: SaleRow): Promise<ReservedLine[]> {
    const lines: ReservedLine[] = [];

    for (const item of sale.items) {
      if (item.inventoryItemId) {
        const reserved = await tx.inventoryItem.updateMany({
          where: { id: item.inventoryItemId, status: InventoryStatus.AVAILABLE },
          data: { status: InventoryStatus.SOLD },
        });
        if (reserved.count === 0) {
          throw AppException.conflict(
            ErrorCode.SALE_ITEM_NOT_AVAILABLE,
            `"${item.product.displayName}" allaqachon sotilgan. Savatdan olib tashlang.`,
            { saleItemId: item.id, inventoryItemId: item.inventoryItemId },
          );
        }

        const unit = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: item.inventoryItemId },
          select: { costPrice: true, costCurrency: true },
        });
        await this.freezeSnapshots(tx, item.id, unit.costPrice, unit.costCurrency);
        lines.push(toLine(item, sale.currency));
        continue;
      }

      if (item.batchId) {
        const reserved = await tx.inventoryBatch.updateMany({
          where: { id: item.batchId, quantityRemaining: { gte: item.quantity } },
          data: { quantityRemaining: { decrement: item.quantity } },
        });
        if (reserved.count === 0) {
          throw AppException.conflict(
            ErrorCode.SALE_INSUFFICIENT_STOCK,
            `"${item.product.displayName}" uchun omborda yetarli miqdor yo'q.`,
            { saleItemId: item.id, batchId: item.batchId },
          );
        }

        const batch = await tx.inventoryBatch.findUniqueOrThrow({
          where: { id: item.batchId },
          select: { unitCost: true, costCurrency: true },
        });
        await this.freezeSnapshots(tx, item.id, batch.unitCost, batch.costCurrency);
        lines.push(toLine(item, sale.currency));
        continue;
      }

      // Qoralamada ombor birligisiz qator bo'lishi mumkin (savat
      // to'ldirilmoqda), tasdiqlashda esa yo'q: aks holda savdo
      // omborga umuman tegmasdan o'tib ketardi
      throw AppException.rule(
        ErrorCode.SALE_ITEM_NOT_AVAILABLE,
        `"${item.product.displayName}" uchun ombordan birlik yoki partiya tanlang.`,
        'items',
        { saleItemId: item.id },
      );
    }

    return lines;
  }

  /** §7.11 — tannarx snapshoti tasdiqlash paytidagi haqiqiy qiymat bilan. */
  private async freezeSnapshots(
    tx: Prisma.TransactionClient,
    saleItemId: string,
    cost: Prisma.Decimal,
    costCurrency: Currency,
  ): Promise<void> {
    await tx.saleItem.update({
      where: { id: saleItemId },
      data: { costSnapshot: cost, costCurrency },
    });
  }

  // ──────────────────────── 2-qadam: raqam (§17.1) ────────────────────────

  /**
   * Savdo raqami — `sale_counters` qator qulfi orqali.
   *
   * `MAX(number) + 1` naqshi ikki parallel tasdiqlashda bir xil raqam
   * berardi. `UPDATE ... RETURNING` esa qatorni qulflaydi va ikkinchi
   * tranzaksiya birinchisini kutadi.
   *
   * Yil **savdo sanasi** bo'yicha (§7.6 — har yil boshida qaytadan):
   * 1-yanvarda orqaga qo'yilgan dekabr savdosi o'tgan yilning
   * ketma-ketligini davom ettirishi kerak.
   *
   * Hisoblagich **har Shop uchun mustaqil** — PK `(shop_id, year)`
   * (§21.9). Shuning uchun ikkala bayonotda ham `shop_id` **aniq**
   * yoziladi: `INSERT` uni DB ustun default'iga (`current_setting`)
   * qoldirishi mumkin edi, lekin bir joyda default'ga tayanib ikkinchi
   * joyda aniq yozish — aynan shu funksiyada `WHERE` dan `shop_id`
   * tushib qolishiga sabab bo'lgan nomuvofiqlik.
   *
   * `$queryRaw` — Prisma extension'ining shop filtri raw SQL'ga
   * qo'llanmaydi (§21.8), ya'ni bu yerda izolyatsiya faqat shu qo'lda
   * yozilgan shartga bog'liq.
   */
  private async allocateNumber(tx: Prisma.TransactionClient, soldAt: Date): Promise<string> {
    const year = Number.parseInt(businessDay(soldAt, this.timeZone).slice(0, 4), 10);
    const shopId = requireShopId();

    await tx.$executeRaw`
      INSERT INTO sale_counters (shop_id, year) VALUES (${shopId}::uuid, ${year})
      ON CONFLICT DO NOTHING
    `;
    const rows = await tx.$queryRaw<{ last_seq: number }[]>`
      UPDATE sale_counters SET last_seq = last_seq + 1
      WHERE shop_id = ${shopId}::uuid AND year = ${year}
      RETURNING last_seq
    `;
    const sequence = rows[0]?.last_seq ?? 1;

    return `${String(year)}-${String(sequence).padStart(5, '0')}`;
  }

  // ──────────────────── 5 va 6-qadam: to'lov va kassa ────────────────────

  /**
   * To'lovlar va ular tug'diradigan kassa kirimlari.
   *
   * §17.10 — **naqd savdo to'liq to'lanadi**: to'lovlar yig'indisi
   * savdo summasiga teng bo'lmasa, savdo tasdiqlanmaydi. Qarz qolishi
   * kerak bo'lsa, u nasiya orqali rasmiylashtiriladi (7-bosqich) —
   * "yarim to'langan naqd savdo" degan holat qarzni hech qayerda
   * qoldirmasdan yo'qotardi.
   */
  private async recordPayments(
    tx: Prisma.TransactionClient,
    params: {
      sale: SaleRow;
      payments: SalePaymentInput[];
      /** To'lovlar yig'indisi AYNAN shunga teng bo'lishi kerak. */
      expectedPaid: string;
      rate: Prisma.Decimal;
      soldAt: Date;
      confirmedAt: Date;
      actor: RequestUser;
    },
  ): Promise<void> {
    const { sale, payments, expectedPaid, rate, soldAt, confirmedAt, actor } = params;

    const accounts = await tx.cashAccount.findMany({
      where: { id: { in: [...new Set(payments.map((payment) => payment.cashAccountId))] } },
      select: { id: true, currency: true, isActive: true, name: true },
    });
    const byId = new Map(accounts.map((account) => [account.id, account]));

    const applied: string[] = [];
    const prepared = payments.map((payment, index) => {
      const account = byId.get(payment.cashAccountId);
      if (!account || !account.isActive) {
        throw AppException.rule(
          ErrorCode.NOT_FOUND,
          'Kassa hisobi topilmadi.',
          `payments.${String(index)}.cashAccountId`,
        );
      }
      // §11.1 — pul o'z valyutasidagi hisobga tushadi; aks holda
      // qoldiq ikki valyutaning aralashmasi bo'lib qolardi
      if (account.currency !== payment.currency) {
        throw AppException.rule(
          ErrorCode.PAYMENT_ACCOUNT_CURRENCY_MISMATCH,
          `"${account.name}" hisobi ${account.currency} da yuritiladi.`,
          `payments.${String(index)}.cashAccountId`,
        );
      }

      const paidAmount = roundMoney(payment.amount, payment.currency);
      const appliedAmount = convert(
        new Prisma.Decimal(paidAmount),
        payment.currency,
        sale.currency,
        rate,
      );
      applied.push(appliedAmount);

      return { payment, account, paidAmount, appliedAmount };
    });

    const paidTotal = sumMoney(applied, sale.currency);
    if (paidTotal !== expectedPaid) {
      throw AppException.rule(
        ErrorCode.SALE_PAYMENT_MISMATCH,
        sale.kind === SaleKind.CASH
          ? "Naqd savdoda to'lovlar summasi savdo summasiga teng bo'lishi kerak. Qarz qolsa, nasiya rasmiylashtiring."
          : "Nasiyada to'lovlar summasi boshlang'ich to'lovga teng bo'lishi kerak.",
        'payments',
        { expected: expectedPaid, paid: paidTotal, currency: sale.currency },
      );
    }

    for (const { payment, account, paidAmount, appliedAmount } of prepared) {
      // §17.2 — o'tkazma Telegram cheki bilan qo'lda tasdiqlanadi,
      // shuning uchun u kassaga hozir tushmaydi
      const confirmedNow = payment.method !== PaymentMethod.TRANSFER;

      const created = await tx.payment.create({
        data: {
          saleId: sale.id,
          paidAmount: new Prisma.Decimal(paidAmount),
          paidCurrency: payment.currency,
          exchangeRate: rate,
          appliedAmount: new Prisma.Decimal(appliedAmount),
          appliedCurrency: sale.currency,
          method: payment.method,
          status: confirmedNow ? PaymentStatus.CONFIRMED : PaymentStatus.PENDING_VERIFICATION,
          paidAt: soldAt,
          confirmedAt: confirmedNow ? confirmedAt : null,
          confirmedById: confirmedNow ? actor.id : null,
          cashAccountId: account.id,
          createdById: actor.id,
        },
      });

      if (confirmedNow) {
        await this.cashEntries.createFromPayment(tx, {
          paymentId: created.id,
          accountId: account.id,
          amount: paidAmount,
          currency: payment.currency,
          occurredAt: soldAt,
          actorId: actor.id,
          note: payment.note ?? null,
        });
      }
    }
  }

  // ──────────────────── 7-qadam: shartnoma va jadval ────────────────────

  /**
   * Nasiya shartnomasi va to'lov jadvali (§9.1) — **savdo bilan bitta
   * tranzaksiyada**.
   *
   * Alohida "shartnoma yaratish" endpointi ataylab yo'q: ikki qadamga
   * bo'linsa, birinchisi o'tib ikkinchisi yiqilgan holatda ombordan
   * telefon chiqib ketgan, qarz esa hech qayerda yozilmagan savdo
   * qolardi — va uni tuzatadigan yo'l ham bo'lmasdi (§21: tasdiqlangan
   * savdo o'zgartirilmaydi).
   *
   * Ustama summa yoki foizdan (§9.3). Foizdan hisoblashda `contracts`
   * dagi `markupFromPercent` ishlatiladi — ekran ham aynan shu
   * funksiyani chaqiradi, ya'ni ega ko'rgan qarz serverning yozadigan
   * qarziga teng bo'ladi.
   */
  private async createContract(
    tx: Prisma.TransactionClient,
    params: { sale: SaleRow; plan: InstallmentPlanInput; total: string; soldAt: Date },
  ): Promise<{ id: string; principal: string }> {
    const { sale, plan, total, soldAt } = params;

    // §17.3 — `cashPrice` savdo summasiga TENG: savdo qatoridagi narx
    // naqd narx, ustama esa faqat shartnomada
    const cashPrice = total;
    const markupAmount =
      plan.markupPercent === undefined
        ? roundMoney(plan.markupAmount ?? '0', sale.currency)
        : markupFromPercent(cashPrice, plan.markupPercent, sale.currency);

    const downPayment = roundMoney(plan.downPayment, sale.currency);
    const principal = principalOf({ cashPrice, markupAmount, downPayment }, sale.currency);

    if (Number(principal) <= 0) {
      throw AppException.rule(
        ErrorCode.VALIDATION_FAILED,
        "Boshlang'ich to'lov qarzdan katta yoki unga teng — bu nasiya emas, naqd savdo.",
        'installment.downPayment',
        { principal, cashPrice, markupAmount },
      );
    }

    // §9.6 — jadval summasi qarzga TENG bo'lishi shart. Teng bo'lmasa
    // savdo umuman tasdiqlanmaydi: farq qayerdadir qarz bo'lib qolardi
    // va uni hech bir ekran ko'rsatmasdi
    const scheduleTotal = sumMoney(
      plan.schedule.map((row) => row.amount),
      sale.currency,
    );
    if (scheduleTotal !== principal) {
      throw AppException.rule(
        ErrorCode.INSTALLMENT_SCHEDULE_SUM_MISMATCH,
        `Jadval summasi qarzga teng bo'lishi kerak: ${scheduleTotal} ≠ ${principal}.`,
        'installment.schedule',
        { scheduleTotal, principal, currency: sale.currency },
      );
    }

    const contract = await tx.installmentContract.create({
      data: {
        saleId: sale.id,
        // §9.2 — shartnoma valyutasi savdo valyutasi va o'zgarmaydi
        currency: sale.currency,
        cashPrice: new Prisma.Decimal(cashPrice),
        markupAmount: new Prisma.Decimal(markupAmount),
        markupPercent:
          plan.markupPercent === undefined ? null : new Prisma.Decimal(plan.markupPercent),
        principal: new Prisma.Decimal(principal),
        downPayment: new Prisma.Decimal(downPayment),
        schedules: {
          create: plan.schedule.map((row, index) => ({
            sequence: index + 1,
            // Kalendar sana (§2.2) — do'kon zonasiga bog'liq emas
            dueDate: new Date(`${row.dueDate}T00:00:00.000Z`),
            amountDue: new Prisma.Decimal(roundMoney(row.amount, sale.currency)),
          })),
        },
      },
    });

    // Jadval birinchi qatori savdo sanasidan oldin bo'lmasligi kerak —
    // o'tmishdagi to'lov muddati darhol "kechikkan" bo'lib ko'rinardi (§9.8)
    const firstDue = plan.schedule[0]?.dueDate;
    if (firstDue !== undefined && firstDue < businessDay(soldAt, this.timeZone)) {
      throw AppException.rule(
        ErrorCode.VALIDATION_FAILED,
        "Birinchi to'lov muddati savdo sanasidan oldin bo'lmasin.",
        'installment.schedule',
        { firstDueDate: firstDue },
      );
    }

    return { id: contract.id, principal };
  }

  // ──────────────────────────── Yordamchilar ────────────────────────────

  private resolveSoldAt(raw: string | undefined, current: Date): Date {
    if (!raw) return current;

    const soldAt = new Date(raw);
    const now = Date.now();
    if (soldAt.getTime() > now) {
      throw AppException.rule(
        ErrorCode.SALE_DATE_OUT_OF_RANGE,
        "Savdo sanasi kelajakda bo'lmaydi.",
        'soldAt',
      );
    }
    if (now - soldAt.getTime() > MAX_BACKDATE_DAYS * 86_400_000) {
      throw AppException.rule(
        ErrorCode.SALE_DATE_OUT_OF_RANGE,
        `Savdo sanasini ${String(MAX_BACKDATE_DAYS)} kundan ortiq orqaga qo'yib bo'lmaydi.`,
        'soldAt',
      );
    }
    return soldAt;
  }
}

interface ReservedLine {
  productId: string;
  inventoryItemId: string | null;
  batchId: string | null;
  quantity: number;
  lineTotal: string;
}

function toLine(item: SaleRow['items'][number], currency: Currency): ReservedLine {
  return {
    productId: item.productId,
    inventoryItemId: item.inventoryItemId,
    batchId: item.batchId,
    quantity: item.quantity,
    lineTotal: multiplyMoney(item.unitPrice.toString(), item.quantity, currency),
  };
}

/**
 * Nasiya sharti savdoning turiga mos kelishini tekshiradi (§9.1).
 *
 * Ikkala yo'nalish ham xato:
 *
 *  - `INSTALLMENT` savdo shartsiz tasdiqlansa, qarz hech qayerda
 *    yozilmasdan qolardi — ombordan telefon chiqadi, kassaga esa faqat
 *    boshlang'ich to'lov tushadi va farqni hech bir ekran ko'rsatmaydi;
 *  - `CASH` savdoga shart berilsa, chaqiruvchi savdo turini noto'g'ri
 *    tushungan bo'ladi. Uni jimgina e'tiborsiz qoldirish — ega nasiya
 *    rasmiylashtirdim deb o'ylab, aslida naqd savdo qilib qo'yishi.
 *
 * Nasiyada mijoz ham MAJBURIY: qarzdorsiz qarz bo'lmaydi. §6.1 mijozni
 * faqat NAQD savdoda ixtiyoriy qiladi.
 */
function assertPlanMatchesKind(
  sale: SaleRow,
  plan: InstallmentPlanInput | undefined,
): InstallmentPlanInput | null {
  if (sale.kind === SaleKind.CASH) {
    if (plan !== undefined) {
      throw AppException.rule(
        ErrorCode.VALIDATION_FAILED,
        "Naqd savdoda nasiya sharti bo'lmaydi.",
        'installment',
      );
    }
    return null;
  }

  if (plan === undefined) {
    throw AppException.rule(
      ErrorCode.VALIDATION_FAILED,
      "Nasiya savdoni tasdiqlash uchun shartnoma sharti va to'lov jadvali kerak.",
      'installment',
    );
  }

  if (sale.customerId === null) {
    throw AppException.rule(
      ErrorCode.SALE_CUSTOMER_REQUIRED,
      'Nasiya savdoda mijoz majburiy — qarz kimning zimmasida ekani yozilishi kerak.',
      'customerId',
    );
  }

  return plan;
}
