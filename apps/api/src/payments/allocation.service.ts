import { Injectable } from '@nestjs/common';
import {
  ContractStatus,
  ErrorCode,
  ScheduleStatus,
  scaleOf,
  type Currency,
} from '@hisobai/contracts';
import { Prisma } from '@prisma/client';

import { AppException } from '../common/app.exception';

/**
 * To'lovni jadval qatorlariga taqsimlash (§10.1) va uni teskari
 * bajarish (§10.6).
 *
 * **Nega alohida jadval (`payment_allocations`), nega shunchaki
 * `amount_paid` ni oshirmaymiz.** To'lov qaytarilganda (§10.6) qarz
 * aynan tiklanishi kerak. Agar faqat kesh oshirilsa, qaytarishda
 * "qaysi qatordan qancha ayirish kerak" degan savolga javob yo'q
 * bo'lardi: bir necha to'lov aralashib ketgan qatorda ulushni qayta
 * hisoblash kerak bo'lardi va u har doim ham bir xil natija bermasdi.
 * Taqsimot qatorlari esa aniq javob beradi — nimani qo'shgan bo'lsak,
 * o'shani olib tashlaymiz.
 *
 * `payment_schedules.amount_paid` va `status` — **kesh** (schema
 * izohida ham shunday yozilgan): haqiqat manbai taqsimotlar. Kesh faqat
 * shu servis ichida, o'sha tranzaksiyada yangilanadi.
 *
 * Tartib: **eng eski to'lanmagan qatordan boshlab** (§10.1), ya'ni
 * `sequence` bo'yicha. Mijoz uchun bu yagona tushunarli qoida —
 * "qaysi oyni to'ladim" degan savolga javob beradi.
 */
@Injectable()
export class AllocationService {
  /**
   * Taqsimlash. `amount` — shartnoma valyutasida, ya'ni allaqachon
   * aylantirilgan (§10.5).
   *
   * Ortiqcha to'lov bu yerga **yetib kelmaydi**: chaqiruvchi uni
   * `PAYMENT_EXCEEDS_OUTSTANDING` bilan oldinroq to'sadi (§10.2).
   * Shunga qaramay tekshiruv bu yerda ham bor — taqsimlanmagan qoldiq
   * jimgina yo'qolib ketishi kassani hisobotdan ajratib yuborardi.
   */
  async allocate(
    tx: Prisma.TransactionClient,
    params: { contractId: string; paymentId: string; amount: string; currency: Currency },
  ): Promise<{ scheduleId: string; amount: string }[]> {
    const { contractId, paymentId, amount, currency } = params;

    const schedules = await tx.paymentSchedule.findMany({
      where: { contractId, status: { not: ScheduleStatus.PAID } },
      orderBy: { sequence: 'asc' },
    });

    let remaining = new Prisma.Decimal(amount);
    const allocations: { scheduleId: string; amount: string }[] = [];

    for (const schedule of schedules) {
      if (remaining.lessThanOrEqualTo(0)) break;

      const due = schedule.amountDue.minus(schedule.amountPaid);
      if (due.lessThanOrEqualTo(0)) continue;

      const take = Prisma.Decimal.min(remaining, due);
      remaining = remaining.minus(take);

      await tx.paymentAllocation.create({
        data: { paymentId, scheduleId: schedule.id, amount: take },
      });

      const paidNow = schedule.amountPaid.plus(take);
      await tx.paymentSchedule.update({
        where: { id: schedule.id },
        data: {
          amountPaid: paidNow,
          status: paidNow.greaterThanOrEqualTo(schedule.amountDue)
            ? ScheduleStatus.PAID
            : ScheduleStatus.PARTIAL,
        },
      });

      allocations.push({ scheduleId: schedule.id, amount: take.toString() });
    }

    if (remaining.greaterThan(0)) {
      throw AppException.rule(
        ErrorCode.PAYMENT_EXCEEDS_OUTSTANDING,
        "To'lov qarz qoldig'idan oshib ketdi.",
        'amount',
        { unallocated: remaining.toString(), currency },
      );
    }

    await this.settle(tx, contractId, currency);
    return allocations;
  }

  /**
   * Taqsimotni bekor qilish — to'lov qaytarilganda (§10.6).
   *
   * Qarz **aynan** tiklanadi: har taqsimot qatori o'z jadval qatoridan
   * ayriladi. Qayta hisoblash yo'li tanlanmadi — u yaxlitlash tufayli
   * asl summadan bir tiyinga farq qilishi mumkin edi va qarz "o'z-o'zidan"
   * o'zgargandek ko'rinardi.
   */
  async deallocate(
    tx: Prisma.TransactionClient,
    params: { paymentId: string; contractId: string; currency: Currency },
  ): Promise<void> {
    const { paymentId, contractId, currency } = params;

    const allocations = await tx.paymentAllocation.findMany({ where: { paymentId } });

    for (const allocation of allocations) {
      const schedule = await tx.paymentSchedule.findUniqueOrThrow({
        where: { id: allocation.scheduleId },
      });
      const paidNow = schedule.amountPaid.minus(allocation.amount);

      await tx.paymentSchedule.update({
        where: { id: schedule.id },
        data: {
          amountPaid: paidNow,
          status: paidNow.lessThanOrEqualTo(0)
            ? ScheduleStatus.UNPAID
            : paidNow.greaterThanOrEqualTo(schedule.amountDue)
              ? ScheduleStatus.PAID
              : ScheduleStatus.PARTIAL,
        },
      });
    }

    await tx.paymentAllocation.deleteMany({ where: { paymentId } });

    // Qarz tiklangani uchun yopilgan shartnoma yana FAOL bo'lishi mumkin
    await this.settle(tx, contractId, currency);
  }

  /**
   * Qarzni kamaytirish — nasiya savdo **qisman** qaytarilganda (§16.12).
   *
   * Kamayish **faqat to'lanmagan qatorlardan va OXIRGISIDAN boshlab**
   * ayriladi. Ikkala shart ham §9.10 dan kelib chiqadi: to'langan va
   * qisman to'langan qatorga tegib bo'lmaydi (ularga taqsimotlar
   * bog'langan), oxirgidan boshlash esa mijozning eng yaqin to'lov
   * muddatini joyida qoldiradi — u allaqachon pul rejalashtirgan va
   * uni surish uchun sabab yo'q.
   *
   * To'lanmagan qatorlar yetmasa, shartnoma **yopiladi** va ortiqcha
   * qism qaytarilmaydi: §16.12 uni ochiq qoldiradi va §8.5 ga
   * yo'naltiradi — to'langan pulni qaytarish/qaytarmaslikni **ega
   * qo'lda hal qiladi**. Tizim buni o'zi qilsa, mijozga
   * so'ralmagan pul chiqarib yuborardi.
   *
   * Status `CLOSED`, `CANCELLED` emas: savdoning qolgan qismi kuchda va
   * mijoz uni sotib olgan. §17.18 `CANCELLED` ni savdo **butunlay**
   * qaytarilgan holatga qoldiradi.
   */
  async reduceDebt(
    tx: Prisma.TransactionClient,
    params: { contractId: string; amount: string; currency: Currency },
  ): Promise<{ reduced: string; unabsorbed: string }> {
    const { contractId, amount, currency } = params;

    const schedules = await tx.paymentSchedule.findMany({
      where: { contractId, status: ScheduleStatus.UNPAID },
      orderBy: { sequence: 'desc' },
    });

    let remaining = new Prisma.Decimal(amount);
    let reduced = new Prisma.Decimal(0);

    for (const schedule of schedules) {
      if (remaining.lessThanOrEqualTo(0)) break;

      const take = Prisma.Decimal.min(remaining, schedule.amountDue);
      remaining = remaining.minus(take);
      reduced = reduced.plus(take);

      const nextDue = schedule.amountDue.minus(take);
      if (nextDue.lessThanOrEqualTo(0)) {
        // Qator butunlay yo'qoladi: to'lanmagan qatorga hech qanday
        // taqsimot bog'lanmagan, ya'ni uni o'chirish tarixni buzmaydi.
        // "0 so'mlik to'lov muddati" esa jadvalda ma'nosiz qator bo'lardi
        await tx.paymentSchedule.delete({ where: { id: schedule.id } });
      } else {
        await tx.paymentSchedule.update({
          where: { id: schedule.id },
          data: { amountDue: nextDue },
        });
      }
    }

    await this.settle(tx, contractId, currency);

    return { reduced: reduced.toString(), unabsorbed: remaining.toString() };
  }

  /**
   * Qarz qoldig'i — jadvaldan hisoblanadi, ustunda saqlanmaydi.
   *
   * `Σ(amountDue − amountPaid)`. Saqlangan "qoldiq" ustuni jadval bilan
   * farq qilib qolardi va qaysi biri to'g'ri ekani noma'lum bo'lardi
   * (`ARCHITECTURE.md` — hisoblanadigan qiymat saqlanmaydi).
   *
   * Hisob **yaxlitlanmaydi**: har qatorni alohida yaxlitlash (`sumMoney`)
   * tiyin qoldig'ini valyutaning eng kichik birligiga ko'tarib
   * yuborardi — 0.50 so'm "1 so'm" bo'lib, §16.11 dagi himoya hech
   * qachon ishlamasdi va ifodalab bo'lmaydigan qoldiq abadiy qarz bo'lib
   * osilib qolardi. Ustunlar `Decimal(18,2)`, ya'ni yig'indi ham aniq.
   */
  async outstandingOf(
    tx: Prisma.TransactionClient,
    contractId: string,
    _currency: Currency,
  ): Promise<string> {
    const schedules = await tx.paymentSchedule.findMany({
      where: { contractId },
      select: { amountDue: true, amountPaid: true },
    });

    return outstandingOfRows(schedules);
  }

  /**
   * Shartnoma holatini qarz qoldig'iga moslash (§17.18).
   *
   * §16.11 — qoldiq valyutaning **eng kichik birligidan kam** bo'lsa
   * (< 1 so'm / < 0.01 USD) shartnoma yopiladi va oxirgi qator `PAID`
   * bo'ladi. Sabab: valyuta aylanishida ifodalab bo'lmaydigan qoldiq
   * paydo bo'lishi mumkin va u abadiy "qarz" bo'lib osilib qolardi —
   * mijoz uni to'lay olmaydi, chunki bunday nominal umuman yo'q.
   *
   * Teskari yo'nalish ham shu yerda: qaytarilgan to'lovdan keyin qarz
   * tiklansa, `CLOSED` shartnoma yana `ACTIVE` bo'ladi. Aks holda
   * qarzi bor, lekin yopilgan shartnoma qolardi va u hech bir
   * qarzdorlar ro'yxatiga tushmasdi.
   */
  private async settle(
    tx: Prisma.TransactionClient,
    contractId: string,
    currency: Currency,
  ): Promise<void> {
    const outstanding = new Prisma.Decimal(await this.outstandingOf(tx, contractId, currency));

    // Eng kichik birlik: UZS uchun 1, USD uchun 0.01
    const smallestUnit = new Prisma.Decimal(10).pow(-scaleOf(currency));
    const settled = outstanding.lessThan(smallestUnit);

    if (settled) {
      // §16.11 — ifodalab bo'lmaydigan qoldiq qatorda ham qolmasin
      await tx.paymentSchedule.updateMany({
        where: { contractId, status: { not: ScheduleStatus.PAID } },
        data: { status: ScheduleStatus.PAID },
      });
    }

    const contract = await tx.installmentContract.findUniqueOrThrow({
      where: { id: contractId },
      select: { status: true },
    });

    // §17.18 — BEKOR QILINGAN shartnomaga tegilmaydi: uni qaytarish
    // bekor qilgan va to'lov harakati uni tiriltirmasligi kerak
    if (contract.status === ContractStatus.CANCELLED) return;

    const nextStatus = settled ? ContractStatus.CLOSED : ContractStatus.ACTIVE;
    if (contract.status !== nextStatus) {
      await tx.installmentContract.update({
        where: { id: contractId },
        data: { status: nextStatus, closedAt: settled ? new Date() : null },
      });
    }
  }
}

/**
 * Qarz qoldig'ining **yagona formulasi**: `Σ(amountDue − amountPaid)`.
 *
 * Alohida funksiya sifatida chiqarilgan, chunki uni ikki joy o'qiydi:
 * to'lov tranzaksiyasi (yuqorida, `tx` orqali) va shartnoma kartasi
 * (`installments.mappers.ts`, allaqachon yuklangan qatorlar ustida).
 * Ikki nusxa yozilganda ular chetga chiqib ketgan edi — mapper har
 * qatorni alohida yaxlitlardi va §16.11 bo'yicha yopilgan shartnoma
 * ekranda hali ham "1 so'm qarzi bor" bo'lib ko'rinardi.
 */
export function outstandingOfRows(
  rows: readonly { amountDue: Prisma.Decimal; amountPaid: Prisma.Decimal }[],
): string {
  return rows
    .reduce((total, row) => total.plus(row.amountDue.minus(row.amountPaid)), new Prisma.Decimal(0))
    .toString();
}
