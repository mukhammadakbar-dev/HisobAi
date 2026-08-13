import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { serializeDecimals } from '../common/decimal-serializer.interceptor';
import { PrismaService } from '../database/prisma.service';
import { runWithoutShopScope, runWithShopScope } from '../database/shop-context';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/**
 * Audit yozuvlari (§2.2, §3.10, §6.7, §21.18).
 *
 * Ikki chaqirish usuli bor va ular ataylab ajratilgan:
 *
 *  - `record()` — **tranzaksiya ichida**. Savdo tasdiqlash, to'lov,
 *    qaytarish kabi moliyaviy amallarda audit yozuvi asosiy o'zgarish
 *    bilan bitta tranzaksiyada bo'lishi shart (ARCHITECTURE §6): amal
 *    saqlanib, audit yozilmay qolishi mumkin emas.
 *  - `recordDetached()` — tranzaksiyadan tashqarida, o'qish amallari
 *    uchun (masalan passport rasmini ko'rish, §6.7).
 *
 * **`shopId` endi majburiy argument** (§21.18, `ARCHITECTURE.md` §14.5).
 * Sabab: `audit_logs.shop_id` ustuni `NULLIF(current_setting(...), '')`
 * default'iga ega — ambient kontekst bo'lsa avtomatik to'ldiriladi, lekin
 * ambient kontekst **umuman ochilmagan** ikkita holat bor:
 *
 *  1. Platforma amallari (`SHOP_ADMIN_CREATED` va h.k.) — `PlatformAdmin`da
 *     Shop tushunchasi umuman yo'q (§21.3);
 *  2. Shop'siz `SHOP_ADMIN` (§21.10 — normal holat) o'z hisobini boshqarsa,
 *     masalan parolini o'zgartirsa. Bu holat implementatsiya paytida
 *     aniqlangan haqiqiy xato edi: `ShopContextInterceptor` `shopId` string
 *     bo'lmasa kontekstni umuman OCHMAYDI (§21.10 — bu to'g'ri, chunki
 *     Shop'siz foydalanuvchi uchun ochadigan Shop yo'q), ya'ni
 *     `AsyncLocalStorage` do'koni `undefined` qoladi. `AuditLog` esa
 *     chiqarilgan (`SHOP_SCOPE_EXEMPT_MODELS`) model EMAS — `decideOperation`
 *     buni "kontekst yo'q" deb ko'radi va bazaga umuman bormasdan
 *     `SHOP_CONTEXT_MISSING` tashlaydi. Tranzaksiya ichida bu **butun
 *     amalni** (masalan parol o'zgarishini) rollback qilardi — audit
 *     yozuvi FAOLIYATNING o'zini yiqitib qo'yardi.
 *
 * Ikkala holatda ham `shopId` chaqiruvchidan **aniq** keladi (odatda
 * `actor.shopId` — u `null` bo'lishi mumkin, `undefined` emas, §21.10
 * bilan bir xil naqsh).
 *
 * **Ikkala tarmoq ham o'z ambient kontekstini ATAYLAB o'zi ochadi**,
 * chaqiruvchining allaqachon qanday kontekstda turganiga ISHONMAYDI:
 *
 *  - `shopId !== null` → `runWithShopScope(shopId, …)`. Ko'pincha bu
 *    keraksiz ko'rinadi (`ShopContextInterceptor` HTTP so'rov boshida
 *    allaqachon ochgan), lekin **hamma yo'l shunday emas** — masalan
 *    `AuthService.resetPassword()` (`@Public()`, parol tiklash havolasi)
 *    hech qanday sessiyasiz ishlaydi: `request.user` umuman yo'q, ya'ni
 *    `ShopContextInterceptor` ambient kontekstni OCHMAYDI, target
 *    foydalanuvchining `shopId`si bor-yo'qligidan qat'i nazar. Agar bu
 *    yerda ambientga ishonilsa, xuddi shu foydalanuvchi Shop'ga ega
 *    bo'lsa ham audit yozuvi `SHOP_CONTEXT_MISSING` bilan qulardi — bu
 *    parolni ilgari yiqitgan xatoning aynan oynadagi aksi (pastga
 *    qarang). `runWithShopScope` allaqachon to'g'ri ambient bor joyda
 *    (masalan `updateAccount`) qayta chaqirilsa ham xavfsiz — bir xil
 *    qiymat bilan qayta o'rnatishdan boshqa narsa qilmaydi.
 *  - `shopId === null` → `runWithoutShopScope()` — bu funksiyaning
 *    IKKINCHI qonuniy chaqiruv joyi (§14.4; birinchisi `Platform`
 *    moduli — ammo uning `PlatformAdmin`/`User`/`Shop` so'rovlari
 *    allaqachon chiqarilgan model, alohida scope talab qilmaydi, shuning
 *    uchun Platform'ning YAGONA scope-sezgir yozuvi ham aynan shu
 *    audit yo'li). Implementatsiya paytida aniqlangan haqiqiy xato:
 *    Shop'siz `SHOP_ADMIN` (§21.10 — normal holat) parolini o'zgartirsa,
 *    `ShopContextInterceptor` `shopId` string bo'lmagani uchun kontekstni
 *    OCHMAYDI (to'g'ri qaror — ochadigan Shop yo'q), ya'ni
 *    `AsyncLocalStorage` do'koni `undefined` qoladi. `AuditLog` esa
 *    chiqarilgan model EMAS — avvalgi kodda `decideOperation` buni
 *    "kontekst yo'q" deb ko'rib, bazaga umuman bormasdan
 *    `SHOP_CONTEXT_MISSING` tashlar edi. Tranzaksiya ichida bu **butun
 *    amalni** rollback qilardi — audit yozuvi FAOLIYATNING o'zini
 *    yiqitib qo'yardi. `audit_logs` siyosati `IS NOT DISTINCT FROM`
 *    bilan yozilgan: kontekstsiz yozilgan `NULL` qator kontekstsiz
 *    o'qishda ham ko'rinadi — demak scope'siz yozuv keyin "yo'qolib
 *    qolmaydi".
 *
 * `data.shopId` hech qachon **qo'lda** yozilmaydi (§21.7) — u ustundagi
 * `dbgenerated` default orqali, yuqoridagi ikki tarmoq o'rnatgan ambient
 * kontekstdan avtomatik to'ldiriladi.
 *
 * **`await` ikkala tarmoqda ham `runWithShopScope`/`runWithoutShopScope`
 * CHAQIRUVI ICHIDA** (`async () => { await tx.auditLog.create(...) }`),
 * TASHQARIDA emas (`() => tx.auditLog.create(...)` keyin natijani
 * `await` qilish YETARLI EMAS). Sabab `prisma.service.ts`dagi
 * `withShopScope` izohida tasvirlangan: Prisma'ning qaytargan qiymati
 * "lazy" — `$allOperations` ichidagi haqiqiy ish faqat `.then()`
 * chaqirilganda boshlanadi. Agar chaqiruv `fn`dan oddiy qaytarilsa-yu,
 * `await` undan TASHQARIDA bo'lsa, o'sha `.then()` `AsyncLocalStorage`
 * doirasi (`storage.run()`ning sinxron ijrosi) TUGAGANDAN KEYIN
 * ishga tushadi — kontekst allaqachon yopilgan bo'ladi va yozuv yana
 * `SHOP_CONTEXT_MISSING` bilan qulaydi. Bu implementatsiya paytida
 * **haqiqiy serverga** qarshi qo'lda tekshirilganda topilgan xato edi:
 * birlik testlar (mock `tx.auditLog.create` — oddiy `vi.fn()`, "lazy"
 * emas) buni ushlamadi, chunki mock darhol ishga tushadi.
 *
 * `Decimal` qiymatlari JSONB ga satr sifatida yoziladi — xom `Decimal`
 * obyekti tushsa, keyin o'qib bo'lmaydigan shakl chiqadi.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    tx: Prisma.TransactionClient,
    shopId: string | null,
    entry: AuditEntry,
  ): Promise<void> {
    const data = toData(entry);
    if (shopId === null) {
      await runWithoutShopScope(async () => {
        await tx.auditLog.create({ data });
      });
      return;
    }
    await runWithShopScope(shopId, async () => {
      await tx.auditLog.create({ data });
    });
  }

  async recordDetached(shopId: string | null, entry: AuditEntry): Promise<void> {
    const data = toData(entry);
    if (shopId === null) {
      await runWithoutShopScope(async () => {
        await this.prisma.auditLog.create({ data });
      });
      return;
    }
    await runWithShopScope(shopId, async () => {
      await this.prisma.auditLog.create({ data });
    });
  }
}

function toData(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
  return {
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    beforeJson: toJson(entry.before),
    afterJson: toJson(entry.after),
    ip: entry.ip ?? null,
  };
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return serializeDecimals(value) as Prisma.InputJsonValue;
}
