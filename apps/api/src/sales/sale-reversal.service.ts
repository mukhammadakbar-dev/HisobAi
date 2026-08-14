import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CashSourceType,
  ContractStatus,
  ErrorCode,
  InventoryStatus,
  PaymentStatus,
  ReversalKind,
  ReversalReason,
  SaleStatus,
  StockMovementType,
  UserRole,
  multiplyMoney,
  prorateMoney,
  roundMoney,
  sumMoney,
  type CancelSaleInput,
  type ReturnSaleInput,
  type SaleDto,
} from '@hisobai/contracts';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { CashEntriesService } from '../cash/cash-entries.service';
import { AppException } from '../common/app.exception';
import { isUniqueViolation } from '../common/prisma-errors';
import { businessDay } from '../common/dates';
import type { RequestUser } from '../common/request-user';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { AllocationService } from '../payments/allocation.service';
import { SALE_INCLUDE, toSaleDto, type SaleRow } from './sales.mappers';
import { MAX_BACKDATE_DAYS, convert, profitOf, saleNotFound } from './sales.service';

/**
 * Qaytarish va bekor qilish (§8, §10) — **bitta tranzaksiya**
 * (`ARCHITECTURE.md` §6).
 *
 * Asl savdo hech qachon o'zgartirilmaydi va o'chirilmaydi: ustiga
 * **teskari `sales` qatori** yoziladi va aynan u yagona haqiqat manbai
 * (§17.4). Asl savdodagi `status` va `sale_items.returned_quantity` —
 * shu qatordan hosila kesh, faqat shu tranzaksiya ichida yangilanadi.
 *
 * **Ikki amal, bitta mexanizm, uchta farq** (§8, §16.5):
 *
 * | | Qaytarish | Bekor qilish |
 * |---|---|---|
 * | Ma'nosi | mahsulot haqiqatan qaytdi | savdo xato kiritilgan, jismonan hech narsa bo'lmagan |
 * | Sana | **o'z sanasi** (§8.7) — o'tgan davr aylanmasi o'zgarmaydi | **asl savdo sanasi** (§16.5) — savdo "umuman bo'lmagandek" |
 * | Ombor | `RETURNED` + sabab (§8.2) | to'g'ridan-to'g'ri `AVAILABLE` |
 * | Qamrov | qisman bo'lishi mumkin (§8.4) | faqat to'liq |
 * | Muddat | cheklovsiz (§8.8) | oxirgi 7 kun (§16.5) |
 *
 * Bekor qilishda muddat cheklovi bor, chunki u **o'tgan kunning**
 * hisobotini o'zgartiradi: kecha yopilgan kassa hisoboti bugun boshqa
 * raqam ko'rsatib qolmasin. Qaytarishda esa bunday xavf yo'q — u o'z
 * kuniga yozilgani uchun eski hisobotlarga umuman tegmaydi, shuning
 * uchun uni cheklash ham kerak emas.
 *
 * `POST /sales/:id/reverse` degan umumiy endpoint ataylab yo'q
 * (`ARCHITECTURE.md` §14.5): ikkalasi biznes ma'nosi jihatidan boshqa
 * amal va ularni bitta "turi" parametri ortiga yashirish foydalanuvchini
 * ham, hisobotni ham chalkashtirardi.
 */
@Injectable()
export class SaleReversalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashEntries: CashEntriesService,
    private readonly allocation: AllocationService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get timeZone(): string {
    return this.config.get('TIMEZONE', { infer: true });
  }

  /** §8 — mahsulot qaytib keldi; qisman bo'lishi mumkin (§8.4). */
  async returnSale(
    id: string,
    input: ReturnSaleInput,
    actor: RequestUser,
    ip: string | null,
  ): Promise<SaleDto> {
    return this.reverse(id, {
      kind: ReversalKind.RETURN,
      reason: input.reason,
      note: input.note ?? null,
      requested: input.items,
      actor,
      ip,
    });
  }

  /** §16.5 — savdo xato kiritilgan; faqat to'liq va faqat oxirgi 7 kun. */
  async cancel(
    id: string,
    input: CancelSaleInput,
    actor: RequestUser,
    ip: string | null,
  ): Promise<SaleDto> {
    return this.reverse(id, {
      kind: ReversalKind.CANCEL,
      reason: input.reason,
      note: input.note ?? null,
      requested: null,
      actor,
      ip,
    });
  }

  // ──────────────────────────── Umumiy yo'l ────────────────────────────

  private async reverse(id: string, params: ReverseParams): Promise<SaleDto> {
    const { kind, reason, note, requested, actor, ip } = params;

    return this.prisma.$transaction(
      async (tx) => {
        const sale = await tx.sale.findUnique({ where: { id }, include: SALE_INCLUDE });
        if (!sale) throw saleNotFound();

        assertReversible(sale, kind);
        if (kind === ReversalKind.CANCEL) this.assertCancelWindow(sale.soldAt);

        const lines = resolveLines(sale, requested);

        // §8.7 / §16.5 — sana amalning ma'nosidan kelib chiqadi
        const occurredAt = kind === ReversalKind.RETURN ? new Date() : sale.soldAt;
        const createdAt = new Date();

        // 1 — teskari qator (§17.4). Raqam asl raqamdan hosil bo'ladi,
        // ya'ni `sale_counters` ga umuman tegilmaydi: teskari yozuv yangi
        // savdo emas va yillik ketma-ketlikni surib yubormasligi kerak
        const number = nextReversalNumber(sale);
        const returnedTotal = sumMoney(
          lines.map((line) => line.lineTotal),
          sale.currency,
        );

        /**
         * Ikki parallel qaytarish bir xil `-R1` raqamini hisoblashi
         * mumkin: raqam tranzaksiya boshida o'qilgan qatorlardan
         * chiqadi va `READ COMMITTED` da ikkinchisi birinchisining
         * hali yozilmagan qatorini ko'rmaydi. `@@unique([shopId, number])`
         * buni baribir to'sadi — bu yerda u tushunarli xatoga
         * aylantiriladi, aks holda foydalanuvchi 500 ni ko'rardi.
         */
        const reversal = await tx.sale
          .create({
            data: {
              number,
              customerId: sale.customerId,
              kind: sale.kind,
              status: SaleStatus.REVERSAL,
              currency: sale.currency,
              // §1.8, §8.1 — ASL kurs. Bugungi kurs olinsa, savdo nolga
              // chiqmasdan soxta kurs foydasi/zarari paydo bo'lardi
              exchangeRate: sale.exchangeRate,
              total: new Prisma.Decimal(returnedTotal).negated(),
              soldAt: occurredAt,
              confirmedAt: createdAt,
              createdById: actor.id,
              reversesSaleId: sale.id,
              reversalKind: kind,
              reversalReason: reason,
              reversalNote: note,
              items: {
                create: lines.map((line) => ({
                  productId: line.item.productId,
                  inventoryItemId: line.item.inventoryItemId,
                  batchId: line.item.batchId,
                  quantity: line.quantity,
                  unitPrice: line.item.unitPrice,
                  // §7.11 — tannarx ham ko'chiriladi: qaytgan mahsulotning
                  // foydasi asl savdodagi tannarx bilan teskari yozilmasa,
                  // hisobotda qaytarish foyda keltirgandek ko'rinardi
                  costSnapshot: line.item.costSnapshot,
                  costCurrency: line.item.costCurrency,
                  suggestedPriceSnapshot: line.item.suggestedPriceSnapshot,
                })),
              },
            },
          })
          .catch((error: unknown) => {
            if (isUniqueViolation(error)) {
              throw AppException.conflict(
                ErrorCode.SALE_ALREADY_RETURNED,
                "Bu savdo ustida ayni paytda boshqa qaytarish bajarilmoqda — qaytadan urinib ko'ring.",
              );
            }
            throw error;
          });

        // 2 — ombor
        await this.restock(tx, {
          lines,
          kind,
          reason,
          note,
          reversalId: reversal.id,
          occurredAt,
          actor,
        });

        // 3 — kesh: asl savdodagi qaytarilgan miqdor va status (§17.4)
        for (const line of lines) {
          await tx.saleItem.update({
            where: { id: line.item.id },
            data: { returnedQuantity: { increment: line.quantity } },
          });
        }
        const status = nextOriginalStatus(sale, lines, kind);
        await tx.sale.update({ where: { id: sale.id }, data: { status } });

        // 4 — nasiya shartnomasi (§17.18, §16.12)
        const contract = await this.adjustContract(tx, sale, { status, returnedTotal, actor });

        /**
         * 5 — pul (§11.7 — tuzatish faqat teskari yozuv orqali).
         *
         * **Nasiyada pul avtomatik qaytarilmaydi** (§8.5): to'langan
         * pulni qaytarish yoki qaytarmaslikni EGA qo'lda hal qiladi.
         * Sabab hujjatda ochiq: qaytarilgan telefon uchun mijoz
         * allaqachon bir necha oy to'lagan bo'lishi mumkin va bu
         * summani nima qilish — muzokara masalasi, hisob-kitob emas.
         * Ega qaroridan keyin har bir to'lovni alohida
         * `POST /payments/:id/reverse` bilan qaytaradi.
         *
         * Naqd savdoda esa aksincha: pul o'sha zahoti qaytadi, chunki
         * u bitta amalda to'liq to'langan (§17.10).
         */
        const refunded =
          contract === null
            ? await this.refund(tx, {
                sale,
                amount: returnedTotal,
                reversalId: reversal.id,
                occurredAt,
                full: status !== SaleStatus.PARTIALLY_RETURNED,
                actor,
              })
            : [];

        // 5 — audit (§8.6 — sabab audit'ga yoziladi)
        await this.audit.record(tx, actor.shopId, {
          actorId: actor.id,
          action: kind === ReversalKind.RETURN ? 'SALE_RETURNED' : 'SALE_CANCELLED',
          entityType: 'Sale',
          entityId: sale.id,
          before: { status: sale.status },
          after: {
            status,
            reversalId: reversal.id,
            reversalNumber: number,
            reversalKind: kind,
            reason,
            note,
            returnedTotal,
            currency: sale.currency,
            occurredAt: occurredAt.toISOString(),
            lines: lines.map((line) => ({ saleItemId: line.item.id, quantity: line.quantity })),
            refunded,
            contract,
          },
          ip,
        });

        const updated = await tx.sale.findUniqueOrThrow({
          where: { id: sale.id },
          include: SALE_INCLUDE,
        });
        const showCost = actor.role === UserRole.SHOP_ADMIN;
        return toSaleDto(updated, {
          showCost,
          profit: showCost ? profitOf(updated) : null,
        });
      },
      { timeout: 30_000 },
    );
  }

  // ──────────────────────────── 2-qadam: ombor ────────────────────────────

  /**
   * Mahsulotni omborga qaytarish.
   *
   * Seriyali birlikda shartli `UPDATE` ishlatiladi (`status: SOLD`) —
   * tasdiqlashdagi bilan bir xil sabab (§17.5): `SELECT` keyin `UPDATE`
   * naqshi `READ COMMITTED` da ikki parallel qaytarishga bitta telefonni
   * ikki marta omborga qaytarishga ruxsat berardi.
   *
   * Qaytarishda status `RETURNED`, bekor qilishda esa to'g'ridan-to'g'ri
   * `AVAILABLE`: bekor qilingan savdoda telefon do'kondan umuman
   * chiqmagan, ya'ni uni "qaytgan mahsulot" deb belgilash yolg'on
   * bo'lardi va §16.4 belgisi savdo formasida bekorga chiqib turardi.
   */
  private async restock(
    tx: Prisma.TransactionClient,
    params: {
      lines: ResolvedLine[];
      kind: ReversalKind;
      reason: ReversalReason;
      note: string | null;
      reversalId: string;
      occurredAt: Date;
      actor: RequestUser;
    },
  ): Promise<void> {
    const { lines, kind, reason, note, reversalId, occurredAt, actor } = params;
    const isReturn = kind === ReversalKind.RETURN;

    for (const line of lines) {
      const { item } = line;

      if (item.inventoryItemId) {
        const restocked = await tx.inventoryItem.updateMany({
          where: { id: item.inventoryItemId, status: InventoryStatus.SOLD },
          data: {
            status: isReturn ? InventoryStatus.RETURNED : InventoryStatus.AVAILABLE,
            // §8.2, §16.4 — sabab saqlanadi va keyin ham tozalanmaydi.
            // Bekor qilishda yozilmaydi: hech narsa qaytmagan
            ...(isReturn ? { returnReason: returnReasonText(reason, note) } : {}),
          },
        });
        if (restocked.count === 0) {
          throw AppException.conflict(
            ErrorCode.SALE_ITEM_NOT_AVAILABLE,
            `"${item.product.displayName}" ombor holati o'zgargan — sahifani yangilang.`,
            { saleItemId: item.id, inventoryItemId: item.inventoryItemId },
          );
        }
      } else if (item.batchId) {
        await tx.inventoryBatch.update({
          where: { id: item.batchId },
          data: { quantityRemaining: { increment: line.quantity } },
        });
      }

      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          inventoryItemId: item.inventoryItemId,
          batchId: item.batchId,
          type: StockMovementType.RETURN,
          // Miqdor musbat: yo'nalishni `type` bildiradi (savdo va qabulda
          // ham shunday) — bir xil ustunda ikki xil ishora aralashmasin
          quantity: line.quantity,
          referenceType: 'SALE_REVERSAL',
          referenceId: reversalId,
          occurredAt,
          actorId: actor.id,
          note: isReturn ? returnReasonText(reason, note) : 'Savdo bekor qilindi',
        },
      });
    }
  }

  // ──────────────────────────── 4-qadam: pul ────────────────────────────

  /**
   * Qaytariladigan pul — teskari kassa yozuvi bilan (§11.7).
   *
   * Summa asl savdoning **to'lovlaridan** olinadi, kassa qoldig'idan
   * emas: pul qaysi hisobga tushgan bo'lsa, o'sha hisobdan chiqadi.
   * Aks holda naqd qaytarilgan savdo karta hisobini kamaytirib
   * qo'yishi mumkin edi va §11.1 ("karta puli kassa yashigida yo'q")
   * buzilardi.
   *
   * To'lovlar **ketma-ket** qamraladi va qisman qaytarishda summa
   * tugaganda to'xtaydi. To'liq qaytarishda bu barcha to'lovlarni aniq
   * nolga chiqaradi (§8.1). Proporsional bo'lish ataylab tanlanmadi: u
   * har bir hisobdan tiyin-tiyin pul chiqarib, kassani sanab
   * solishtirishni imkonsiz qilardi — §11.3 da nomlangan muammoning
   * o'zi.
   *
   * **Har to'lovdan qancha pul allaqachon qaytgani hisobga olinadi.**
   * Manba — o'sha to'lovga bog'langan `REVERSAL` kassa yozuvlari: ular
   * pul kassadan qachon va qancha chiqqanini aniq biladi. Usiz ikkinchi
   * qisman qaytarish yana BIRINCHI to'lovdan boshlab hisoblardi va
   * hisobdan tushgan pul unga umuman tushmagan summadan oshib ketardi —
   * kassani sanab solishtirish imkonsiz bo'lardi (aynan §11.1 buzilardi).
   *
   * Chegara **to'lov valyutasida** hisoblanadi, savdo valyutasida emas:
   * kassadan chiqadigan haqiqiy pul ham shu valyutada va §11.1 uchun
   * ahamiyatlisi aynan shu.
   *
   * `PENDING_VERIFICATION` o'tkazma kassaga umuman tushmagan (§17.2),
   * ya'ni undan qaytariladigan pul yo'q. U faqat savdo TO'LIQ qaytarilsa
   * `REJECTED` bo'ladi: qisman qaytarishda savdo hali kuchda va kelayotgan
   * pulni rad etish uni yo'qotardi — pul kelganda tasdiqlanadigan to'lov
   * qatori qolmasdi.
   */
  private async refund(
    tx: Prisma.TransactionClient,
    params: {
      sale: SaleRow;
      amount: string;
      reversalId: string;
      occurredAt: Date;
      /** Savdo butunlay qaytdimi — kutilayotgan o'tkazmaning taqdiri shunga bog'liq. */
      full: boolean;
      actor: RequestUser;
    },
  ): Promise<RefundLine[]> {
    const { sale, amount, reversalId, occurredAt, full, actor } = params;
    const refunds: RefundLine[] = [];

    let remaining = new Prisma.Decimal(amount);

    for (const payment of sale.payments) {
      if (payment.status === PaymentStatus.PENDING_VERIFICATION) {
        if (full) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: PaymentStatus.REJECTED },
          });
        }
        continue;
      }
      if (payment.status !== PaymentStatus.CONFIRMED) continue;
      if (remaining.lessThanOrEqualTo(0)) continue;

      // Shu to'lovdan ilgari qaytarilgan pul (oldingi qisman qaytarishlar)
      const previous = await tx.cashEntry.aggregate({
        where: { paymentId: payment.id, sourceType: CashSourceType.REVERSAL },
        _sum: { amount: true },
      });
      const alreadyBack = previous._sum.amount ?? new Prisma.Decimal(0);
      const availablePaid = payment.paidAmount.minus(alreadyBack);
      if (availablePaid.lessThanOrEqualTo(0)) continue;

      // Qancha qaytarish kerakligini to'lov valyutasiga keltiramiz (§8.1 —
      // ASL kurs), so'ng shu to'lovda qolgan pul bilan cheklaymiz
      const wantPaid = new Prisma.Decimal(
        convert(remaining, sale.currency, payment.paidCurrency, payment.exchangeRate),
      );
      const takePaid = Prisma.Decimal.min(wantPaid, availablePaid);
      if (takePaid.lessThanOrEqualTo(0)) continue;

      // Savdo valyutasidagi ekvivalenti — qolgan summadan aynan shuncha ayriladi
      const takeApplied = Prisma.Decimal.min(
        remaining,
        new Prisma.Decimal(
          convert(takePaid, payment.paidCurrency, sale.currency, payment.exchangeRate),
        ),
      );
      remaining = remaining.minus(takeApplied);

      const paidBack = roundMoney(takePaid.toString(), payment.paidCurrency);
      const drained = availablePaid.minus(takePaid).lessThanOrEqualTo(0);

      if (payment.cashAccountId) {
        await this.cashEntries.createReversal(tx, {
          accountId: payment.cashAccountId,
          paymentId: payment.id,
          reversalId,
          amount: paidBack,
          currency: payment.paidCurrency,
          occurredAt,
          actorId: actor.id,
        });
      }

      // To'lov puli BUTUNLAY qaytganda `REVERSED` bo'ladi — bir necha
      // qisman qaytarishdan keyin ham. Qisman holatda `CONFIRMED` bo'lib
      // qoladi: "yarim qaytarilgan to'lov" degan status yo'q va uni
      // ixtiro qilish hisobotni buzardi
      if (drained) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.REVERSED },
        });
      }

      refunds.push({
        paymentId: payment.id,
        amount: paidBack,
        currency: payment.paidCurrency,
        full: drained,
      });
    }

    return refunds;
  }

  // ──────────────────────── Nasiya shartnomasi ────────────────────────

  /**
   * §17.18 — savdo qaytarilsa yoki bekor qilinsa shartnoma **BEKOR
   * QILINGAN** bo'ladi.
   *
   * Usiz mijoz mavjud bo'lmagan savdo uchun qarzdor bo'lib qolardi:
   * telefon omborga qaytadi, boshlang'ich to'lov qaytariladi, jadval
   * esa qolgan to'lovlarni kutib turaveradi va shartnoma qarzdorlar
   * ro'yxatida ko'rinib turadi.
   *
   * **Qisman qaytarishda esa qarz KAMAYADI** (§16.12): qaytgan qatorlar
   * qiymati va unga tegishli **proporsional ustama** miqdorida.
   * Kamayish faqat to'lanmagan qatorlardan va oxirgisidan boshlab
   * ayriladi — `AllocationService.reduceDebt` ga qarang.
   *
   * Ustama nega proporsional: u butun savdoga qo'yilgan (§9.3), ya'ni
   * savdoning yarmi qaytsa ustamaning ham yarmi asossiz bo'lib qoladi.
   * Uni to'liq qoldirish mijozdan qaytarilgan mahsulot uchun ustama
   * undirish bo'lardi; butunlay olib tashlash esa qolgan mahsulot
   * uchun ustamani bekor qilardi.
   */
  private async adjustContract(
    tx: Prisma.TransactionClient,
    sale: SaleRow,
    params: { status: SaleStatus; returnedTotal: string; actor: RequestUser },
  ): Promise<ContractOutcome | null> {
    const { status, returnedTotal, actor } = params;

    const contract = await tx.installmentContract.findUnique({
      where: { saleId: sale.id },
      select: { id: true, status: true, currency: true, cashPrice: true, markupAmount: true },
    });
    if (!contract) return null;
    if (contract.status === ContractStatus.CANCELLED) return null;

    if (status !== SaleStatus.PARTIALLY_RETURNED) {
      await tx.installmentContract.update({
        where: { id: contract.id },
        data: { status: ContractStatus.CANCELLED, closedAt: new Date() },
      });

      await this.audit.record(tx, actor.shopId, {
        actorId: actor.id,
        action: 'INSTALLMENT_CONTRACT_CANCELLED',
        entityType: 'InstallmentContract',
        entityId: contract.id,
        before: { status: contract.status },
        after: { status: ContractStatus.CANCELLED, saleId: sale.id },
        ip: null,
      });

      return { contractId: contract.id, cancelled: true };
    }

    // §16.12 — qaytgan qiymat + unga tegishli ustama ulushi
    const markupShare = prorateMoney(
      contract.markupAmount.toString(),
      returnedTotal,
      contract.cashPrice.toString(),
      contract.currency,
    );
    const reduction = sumMoney([returnedTotal, markupShare], contract.currency);

    const outcome = await this.allocation.reduceDebt(tx, {
      contractId: contract.id,
      amount: reduction,
      currency: contract.currency,
    });

    await this.audit.record(tx, actor.shopId, {
      actorId: actor.id,
      action: 'INSTALLMENT_DEBT_REDUCED',
      entityType: 'InstallmentContract',
      entityId: contract.id,
      after: {
        saleId: sale.id,
        returnedTotal,
        markupShare,
        reduction,
        reduced: outcome.reduced,
        // §8.5 — to'lanmagan qatorlar yetmagan qism: uni qaytarish yoki
        // qaytarmaslikni EGA hal qiladi, tizim o'zi pul chiqarmaydi
        unabsorbed: outcome.unabsorbed,
        currency: contract.currency,
      },
      ip: null,
    });

    return { contractId: contract.id, cancelled: false, ...outcome, markupShare, reduction };
  }

  // ──────────────────────────── Yordamchilar ────────────────────────────

  /**
   * §16.5 — bekor qilish faqat oxirgi 7 kun ichidagi savdolarga.
   *
   * Chegara savdo tasdiqlashdagi orqaga qo'yish chegarasi bilan bir xil
   * (`MAX_BACKDATE_DAYS`) va bu tasodif emas: ikkalasi ham "o'tgan
   * kunning yopilgan hisobotiga tegmaslik" degan bitta qoidadan chiqadi.
   */
  private assertCancelWindow(soldAt: Date): void {
    const age = Date.now() - soldAt.getTime();
    if (age > MAX_BACKDATE_DAYS * 86_400_000) {
      throw AppException.conflict(
        ErrorCode.SALE_CANCEL_WINDOW_EXPIRED,
        `Bekor qilish faqat oxirgi ${String(MAX_BACKDATE_DAYS)} kun ichidagi savdolarga qo'llanadi. Buning o'rniga qaytarishni rasmiylashtiring.`,
        { soldAt: businessDay(soldAt, this.timeZone) },
      );
    }
  }
}

interface ReverseParams {
  kind: ReversalKind;
  reason: ReversalReason;
  note: string | null;
  /** `null` — bekor qilish, ya'ni butun savdo. */
  requested: ReturnSaleInput['items'] | null;
  actor: RequestUser;
  ip: string | null;
}

interface ResolvedLine {
  item: SaleRow['items'][number];
  quantity: number;
  lineTotal: string;
}

/** Qaytarish nasiya shartnomasiga qanday ta'sir qilgani — audit uchun. */
interface ContractOutcome {
  contractId: string;
  cancelled: boolean;
  reduced?: string;
  /** §8.5 — to'lanmagan qatorlar yetmagan qism; ega qo'lda hal qiladi. */
  unabsorbed?: string;
  markupShare?: string;
  reduction?: string;
}

interface RefundLine {
  paymentId: string;
  amount: string;
  currency: string;
  full: boolean;
}

/** §8.6 — sabab omborda ham saqlanadi, faqat auditda emas. */
function returnReasonText(reason: ReversalReason, note: string | null): string {
  return note?.trim() ? `${reason}: ${note.trim()}` : reason;
}

/**
 * Faqat tasdiqlangan savdo qaytariladi.
 *
 * `DRAFT` uchun alohida xato: qoralamani "qaytarish" mumkin emas, uni
 * shunchaki o'chirish kerak va foydalanuvchiga aynan shu aytiladi.
 */
function assertReversible(sale: SaleRow, kind: ReversalKind): void {
  if (sale.status === SaleStatus.DRAFT) {
    throw AppException.conflict(
      ErrorCode.SALE_NOT_DRAFT,
      "Qoralama savdo qaytarilmaydi — uni o'chirish kerak.",
    );
  }

  if (sale.status === SaleStatus.REVERSAL) {
    throw AppException.conflict(
      ErrorCode.SALE_ALREADY_RETURNED,
      "Teskari yozuvning o'zi qaytarilmaydi.",
    );
  }

  if (sale.status === SaleStatus.CANCELLED || sale.status === SaleStatus.RETURNED) {
    throw AppException.conflict(
      ErrorCode.SALE_ALREADY_RETURNED,
      'Bu savdo allaqachon to‘liq qaytarilgan yoki bekor qilingan.',
    );
  }

  // Qisman qaytarilgan savdoni bekor qilib bo'lmaydi: bekor qilish
  // "jismonan hech narsa bo'lmagan" degani, qaytarish esa mahsulot
  // haqiqatan qaytganini allaqachon qayd etgan. Ikkalasi bir savdoda
  // rost bo'la olmaydi
  if (kind === ReversalKind.CANCEL && sale.status === SaleStatus.PARTIALLY_RETURNED) {
    throw AppException.conflict(
      ErrorCode.SALE_ALREADY_RETURNED,
      'Qisman qaytarilgan savdo bekor qilinmaydi — qolganini qaytaring.',
    );
  }
}

/**
 * Qaytariladigan qatorlar va ularning summasi.
 *
 * Bekor qilishda (`requested === null`) savdoning **qolgan hammasi**
 * olinadi. Qaytarishda esa har bir so'ralgan qator tekshiriladi:
 * savdoga tegishlimi va qolgan miqdordan oshmaydimi.
 */
function resolveLines(sale: SaleRow, requested: ReturnSaleInput['items'] | null): ResolvedLine[] {
  if (requested === null) {
    return sale.items
      .map((item) => toResolved(item, item.quantity - item.returnedQuantity, sale.currency))
      .filter((line) => line.quantity > 0);
  }

  const byId = new Map(sale.items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const lines: ResolvedLine[] = [];

  requested.forEach((row, index) => {
    const item = byId.get(row.saleItemId);
    if (!item) {
      throw AppException.rule(
        ErrorCode.NOT_FOUND,
        'Qator bu savdoga tegishli emas.',
        `items.${String(index)}.saleItemId`,
      );
    }
    // Bitta qator ikki marta yuborilsa, tekshiruvlar alohida-alohida
    // o'tib ketardi va yig'indisi qolgan miqdordan oshib ketardi
    if (seen.has(row.saleItemId)) {
      throw AppException.rule(
        ErrorCode.VALIDATION_FAILED,
        'Bitta qator ikki marta yuborilgan.',
        `items.${String(index)}.saleItemId`,
      );
    }
    seen.add(row.saleItemId);

    const remaining = item.quantity - item.returnedQuantity;
    if (row.quantity > remaining) {
      throw AppException.rule(
        ErrorCode.VALIDATION_FAILED,
        `"${item.product.displayName}" uchun qaytarish mumkin bo'lgan miqdor: ${String(remaining)}.`,
        `items.${String(index)}.quantity`,
        { saleItemId: item.id, remaining },
      );
    }

    lines.push(toResolved(item, row.quantity, sale.currency));
  });

  if (lines.length === 0) {
    throw AppException.rule(ErrorCode.SALE_EMPTY, 'Qaytarish uchun qator tanlanmadi.', 'items');
  }

  return lines;
}

function toResolved(
  item: SaleRow['items'][number],
  quantity: number,
  currency: SaleRow['currency'],
): ResolvedLine {
  return {
    item,
    quantity,
    lineTotal: multiplyMoney(item.unitPrice.toString(), quantity, currency),
  };
}

/**
 * Asl savdoning yangi holati — **kesh** (§17.4).
 *
 * Bekor qilish har doim `CANCELLED`: u qisman bo'lmaydi. Qaytarishda
 * esa hamma qator to'liq qaytgan bo'lsa `RETURNED`, aks holda
 * `PARTIALLY_RETURNED`.
 */
function nextOriginalStatus(sale: SaleRow, lines: ResolvedLine[], kind: ReversalKind): SaleStatus {
  if (kind === ReversalKind.CANCEL) return SaleStatus.CANCELLED;

  const returnedNow = new Map(lines.map((line) => [line.item.id, line.quantity]));
  const allReturned = sale.items.every(
    (item) => item.returnedQuantity + (returnedNow.get(item.id) ?? 0) >= item.quantity,
  );

  return allReturned ? SaleStatus.RETURNED : SaleStatus.PARTIALLY_RETURNED;
}

/**
 * §17.4 — `2026-00147-R1`, `-R2`, …
 *
 * Raqam asl savdoning raqamidan hosil bo'ladi va tartib raqami mavjud
 * teskari qatorlar sonidan olinadi. `sale_counters` ga tegilmaydi:
 * teskari yozuv yangi savdo emas, uni yillik ketma-ketlikka qo'shish
 * "bu yil nechta savdo bo'ldi" degan savolga yolg'on javob berardi.
 */
function nextReversalNumber(sale: SaleRow): string {
  return `${sale.number ?? 'SAVDO'}-R${String(sale.reversals.length + 1)}`;
}
