# HisobAI CRM — Atamalar lug'ati (v0.2.1)

Kod **inglizcha** enum ishlatadi, UI **o'zbekcha** ko'rsatadi. Hujjatlarda
enum qiymati yoziladi, o'zbekcha nom faqat UI matni sifatida. Bu jadval —
ikkalasi orasidagi yagona ko'prik (§16 muhokamasi, CONFLICT #11).

**Qoida:** o'zbekcha atama hech qachon kodda identifikator bo'lmaydi.
Tarjima faqat bitta joyda — `apps/web` i18n lug'atida.

---

## Valyuta va pul

| Enum / atama             | UI matni          | Izoh                                       |
| ------------------------ | ----------------- | ------------------------------------------ |
| `Currency.UZS`           | so'm              | Bazaviy valyuta (§1.1)                     |
| `Currency.USD`           | dollar            |                                            |
| `BASE_CURRENCY`          | bazaviy valyuta   | Doim `UZS`, sozlanmaydi (§16 CONFLICT #12) |
| `cbuRate`                | CBU kursi         | Ma'lumot uchun (§3.1)                      |
| `storeRate`              | do'kon kursi      | Savdo va to'lovlarda ishlatiladi (§3.1)    |
| `exchangeRate`           | kurs              | Snapshot qiymat (§1.7)                     |
| `storeRateMarkupPercent` | kurs ustamasi (%) | §16.2                                      |

## Foydalanuvchi va kirish

| Enum                       | UI matni            |
| -------------------------- | ------------------- |
| `Shop`                     | do'kon              |
| `UserRole.SHOP_ADMIN`      | do'kon egasi        |
| `PlatformAdmin`            | platforma admini    |
| `AccountStatus.ACTIVE`     | faol                |
| `AccountStatus.SUSPENDED`  | vaqtincha to'xtatilgan |
| `AccountStatus.DISABLED`   | o'chirilgan         |
| `Theme.SYSTEM`             | Tizim mavzusi       |
| `Theme.LIGHT`              | Yorug'              |
| `Theme.DARK`               | Qorong'i            |
| `Session`                  | sessiya / qurilma   |
| `LoginAttempt`             | kirish urinishi     |

> `UserRole.OWNER` → `SHOP_ADMIN` ga qayta nomlandi (§21.2). UI matni
> o'zgarmadi: foydalanuvchi uchun u baribir do'kon egasi.

## Katalog va ombor

| Enum                             | UI matni            |
| -------------------------------- | ------------------- |
| `Product`                        | mahsulot (shablon)  |
| `InventoryItem`                  | ombor birligi       |
| `InventoryBatch`                 | partiya             |
| `ProductType.SERIALIZED`         | seriyali            |
| `ProductType.QUANTITY`           | miqdorli            |
| `InventoryStatus.AVAILABLE`      | Mavjud              |
| `InventoryStatus.SOLD`           | Sotilgan            |
| `InventoryStatus.RETURNED`       | Qaytarilgan         |
| `InventoryStatus.WRITTEN_OFF`    | Chiqarilgan         |
| `StockMovementType.RECEIVE`      | Qabul               |
| `StockMovementType.SALE`         | Sotuv               |
| `StockMovementType.RETURN`       | Qaytarish           |
| `StockMovementType.ADJUST`       | Tuzatish            |
| `StockMovementType.PERSONAL_USE` | Shaxsiy foydalanish |
| `StockAdjustReason.LOST`         | Yo'qolgan           |
| `StockAdjustReason.DEFECTIVE`    | Nuqsonli            |
| `StockAdjustReason.MISCOUNT`     | Xato hisob          |
| `StockAdjustReason.OTHER`        | Boshqa              |
| `Stocktake`                      | inventarizatsiya    |
| `StocktakeStatus.IN_PROGRESS`    | Davom etmoqda       |
| `StocktakeStatus.COMPLETED`      | Yakunlangan         |
| `StocktakeStatus.CANCELLED`      | Bekor qilingan      |

## Savdo

| Enum                                   | UI matni                       |
| -------------------------------------- | ------------------------------ |
| `Sale`                                 | savdo                          |
| `SaleItem`                             | savdo qatori                   |
| `SaleKind.CASH`                        | Naqd                           |
| `SaleKind.INSTALLMENT`                 | Nasiya                         |
| `SaleStatus.DRAFT`                     | Qoralama                       |
| `SaleStatus.CONFIRMED`                 | Tasdiqlangan                   |
| `SaleStatus.PARTIALLY_RETURNED`        | Qisman qaytarilgan             |
| `SaleStatus.RETURNED`                  | Qaytarilgan                    |
| `SaleStatus.CANCELLED`                 | Bekor qilingan                 |
| `SaleStatus.REVERSAL`                  | Teskari yozuv (§17.4)          |
| `ReversalKind.RETURN`                  | Qaytarish                      |
| `ReversalKind.CANCEL`                  | Bekor qilish                   |
| `ReversalReason.DEFECTIVE`             | Nuqson                         |
| `ReversalReason.CUSTOMER_CHANGED_MIND` | Mijoz fikri o'zgardi           |
| `ReversalReason.ENTRY_ERROR`           | Xato kiritildi                 |
| `ReversalReason.OTHER`                 | Boshqa                         |
| `costSnapshot`                         | tannarx (savdo paytidagi)      |
| `suggestedPriceSnapshot`               | tavsiya narx (savdo paytidagi) |

## Nasiya

| Enum                             | UI matni              |
| -------------------------------- | --------------------- |
| `InstallmentContract`            | nasiya shartnomasi    |
| `PaymentSchedule`                | to'lov jadvali qatori |
| `ContractStatus.ACTIVE`          | Faol                  |
| `ContractStatus.CLOSED`          | Yopilgan              |
| `ContractStatus.CANCELLED`       | Bekor qilingan        |
| `ScheduleStatus.UNPAID`          | To'lanmagan           |
| `ScheduleStatus.PARTIAL`         | Qisman to'langan      |
| `ScheduleStatus.PAID`            | To'langan             |
| `cashPrice`                      | naqd narx             |
| `markupAmount` / `markupPercent` | ustama                |
| `principal`                      | qarz (asosiy summa)   |
| `downPayment`                    | boshlang'ich to'lov   |
| — (hisoblanadi)                  | Muddati o'tgan        |

> **`Muddati o'tgan` — enum emas.** `dueDate < bugun AND status != PAID`
> shartidan hisoblanadi (§9.8). Uni hech qachon ustunga aylantirmang.

## To'lovlar

| Enum                                 | UI matni               |
| ------------------------------------ | ---------------------- |
| `Payment`                            | to'lov                 |
| `PaymentAllocation`                  | to'lov taqsimoti       |
| `PaymentMethod.CASH`                 | Naqd                   |
| `PaymentMethod.CARD`                 | Karta                  |
| `PaymentMethod.TRANSFER`             | O'tkazma               |
| `PaymentStatus.PENDING_VERIFICATION` | Tekshirilmoqda         |
| `PaymentStatus.CONFIRMED`            | Tasdiqlangan           |
| `PaymentStatus.REJECTED`             | Rad etilgan            |
| `PaymentStatus.REVERSED`             | Qaytarilgan            |
| `paidAmount` / `paidCurrency`        | berilgan summa         |
| `appliedAmount` / `appliedCurrency`  | qarzdan ayrilgan summa |

## Kassa

| Enum                             | UI matni             |
| -------------------------------- | -------------------- |
| `CashAccount`                    | kassa hisobi         |
| `CashEntry`                      | kassa yozuvi         |
| `CashExchange`                   | valyuta ayirboshlash |
| `CashAccountKind.CASH`           | Naqd                 |
| `CashAccountKind.BANK`           | Bank                 |
| `CashAccountKind.CARD`           | Karta                |
| `CashDirection.IN`               | Kirim                |
| `CashDirection.OUT`              | Chiqim               |
| `CashSourceType.PAYMENT`         | To'lovdan            |
| `CashSourceType.MANUAL`          | Qo'lda               |
| `CashSourceType.OPENING_BALANCE` | Boshlang'ich qoldiq  |
| `CashSourceType.EXCHANGE`        | Ayirboshlash         |
| `CashSourceType.REVERSAL`        | Teskari yozuv        |

> `CashSourceType.SALE` va `CashSourceType.PERSONAL_USE` **olib tashlandi**
> (§17.2, §17.12). Kassaga pul faqat `PAYMENT` orqali tushadi; shaxsiy
> foydalanish esa pul bo'lmagan xarajat.

## Fayl, hujjat, bildirishnoma

| Enum                                    | UI matni                |
| --------------------------------------- | ----------------------- |
| `FileAsset`                             | fayl                    |
| `FileKind.PASSPORT`                     | Passport rasmi          |
| `FileKind.RECEIPT`                      | Chek surati             |
| `FileKind.PRODUCT_IMAGE`                | Mahsulot rasmi          |
| `FileKind.CASH_ATTACHMENT`              | Kassa ilovasi           |
| `FileKind.SHOP_LOGO`                    | Do'kon logosi           |
| `FileKind.CONTRACT_PDF`                 | Shartnoma PDF           |
| `DocumentType.INSTALLMENT_CONTRACT`     | Nasiya shartnomasi      |
| `NotificationChannel.PUSH`              | Brauzer bildirishnomasi |
| `NotificationChannel.SMS`               | SMS                     |
| `NotificationType.PAYMENT_DUE_REMINDER` | To'lov eslatmasi        |
| `NotificationStatus.PENDING`            | Navbatda                |
| `NotificationStatus.PROCESSING`         | Yuborilmoqda            |
| `NotificationStatus.SENT`               | Yuborilgan              |
| `NotificationStatus.FAILED`             | Xato                    |
| `NotificationStatus.SKIPPED`            | O'tkazib yuborilgan     |
| `AuditLog`                              | audit yozuvi            |
