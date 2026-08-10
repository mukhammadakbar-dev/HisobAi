import { ErrorCode } from '@hisobai/contracts';

import { ApiError } from './api-error';

/**
 * Foydalanuvchiga ko'rinadigan matnlar (`design.md` §7).
 *
 * Uslub qoidalari:
 *  - nima bo'lgani **va** nima qilish kerakligi aytiladi;
 *  - uzr so'ralmaydi ("kechirasiz", "afsuski" yo'q);
 *  - texnik atama chiqmaydi ("xatolik 500" emas — "Server javob bermadi");
 *  - bir tushuncha — bir nom (`GLOSSARY.md`).
 */
const ERROR_MESSAGES: Partial<Record<string, string>> = {
  [ErrorCode.NETWORK_ERROR]: "Internet yo'q. Ulanishni tekshirib, qaytadan urinib ko'ring.",
  [ErrorCode.INTERNAL_ERROR]: "Server javob bermadi. Qayta urinib ko'ring.",
  [ErrorCode.RATE_LIMITED]: "Juda ko'p urinish bo'ldi. Biroz kutib turing.",
  [ErrorCode.NOT_FOUND]: 'Topilmadi.',
  [ErrorCode.FORBIDDEN]: "Bu amalga ruxsatingiz yo'q.",
  [ErrorCode.VALIDATION_FAILED]: "Forma to'ldirilishida xato bor.",
  [ErrorCode.STALE_RESOURCE]:
    "Bu yozuv boshqa joyda o'zgartirildi. Sahifani yangilab, qaytadan urinib ko'ring.",
  // Bu — ishlab chiquvchi xatosi (qulf tokeni yuborilmagan). Foydalanuvchi
  // baribir matn ko'radi, shuning uchun u ham amaliy bo'lsin.
  [ErrorCode.PRECONDITION_REQUIRED]: 'Sahifani yangilab, qaytadan urinib ko‘ring.',

  [ErrorCode.AUTH_REQUIRED]: 'Tizimga kiring.',
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: "Email yoki parol noto'g'ri.",
  [ErrorCode.AUTH_BLOCKED]: "Kirish vaqtincha bloklandi. 15 daqiqadan keyin urinib ko'ring.",
  [ErrorCode.AUTH_SESSION_EXPIRED]: 'Sessiya tugadi. Qaytadan kiring.',
  [ErrorCode.AUTH_TOKEN_INVALID]: 'Havola eskirgan. Parolni tiklashni qaytadan boshlang.',
  [ErrorCode.AUTH_TOKEN_USED]: 'Bu havola allaqachon ishlatilgan.',
  [ErrorCode.AUTH_CSRF_INVALID]: "So'rov tasdiqlanmadi. Sahifani yangilang.",

  [ErrorCode.IDEMPOTENCY_KEY_REUSED]: 'Sahifani yangilab, amalni qaytadan bajaring.',
  [ErrorCode.REQUEST_IN_PROGRESS]: "Avvalgi so'rov bajarilmoqda. Biroz kuting.",

  [ErrorCode.SALE_NOT_DRAFT]:
    "Tasdiqlangan savdo o'zgartirilmaydi. Qaytarish yoki bekor qilish orqali tuzating.",
  [ErrorCode.SALE_ALREADY_CONFIRMED]: 'Bu savdo allaqachon tasdiqlangan.',
  [ErrorCode.SALE_EMPTY]: "Savatga kamida bitta mahsulot qo'shing.",
  [ErrorCode.SALE_ITEM_NOT_AVAILABLE]: 'Bu mahsulot allaqachon sotilgan. Savatdan olib tashlang.',
  [ErrorCode.SALE_INSUFFICIENT_STOCK]: "Omborda yetarli miqdor yo'q.",
  [ErrorCode.SALE_CUSTOMER_REQUIRED]: 'Nasiya savdoda mijoz tanlanishi shart.',
  [ErrorCode.SALE_PAYMENT_MISMATCH]:
    "Naqd savdoda to'lovlar summasi savdo summasiga teng bo'lishi kerak. Qarz qolsa, nasiya rasmiylashtiring.",
  [ErrorCode.SALE_DATE_OUT_OF_RANGE]: "Savdo sanasini 7 kundan ortiq orqaga qo'yib bo'lmaydi.",
  [ErrorCode.SALE_CANCEL_WINDOW_EXPIRED]:
    'Bekor qilish faqat 7 kun ichida. Eski savdo uchun qaytarishdan foydalaning.',
  [ErrorCode.SALE_ALREADY_RETURNED]: "Bu savdo allaqachon to'liq qaytarilgan.",
  [ErrorCode.SALE_REVERSAL_REASON_REQUIRED]: 'Sababni tanlang.',

  [ErrorCode.INSTALLMENT_SCHEDULE_SUM_MISMATCH]:
    "To'lov jadvalining summasi qarzga teng bo'lishi kerak.",
  [ErrorCode.INSTALLMENT_SCHEDULE_ROW_PAID]:
    "To'langan qatorni o'zgartirib bo'lmaydi. Faqat to'lanmagan qatorlarni qayta tuzing.",
  [ErrorCode.INSTALLMENT_CONTRACT_NOT_ACTIVE]: 'Bu shartnoma faol emas.',

  [ErrorCode.PAYMENT_EXCEEDS_OUTSTANDING]:
    'Qarzdan ortiq summa qabul qilinmaydi. Qolgan qarz miqdoricha kiriting.',
  [ErrorCode.PAYMENT_ACCOUNT_CURRENCY_MISMATCH]:
    "To'lov valyutasi tanlangan kassa hisobiga mos emas.",
  [ErrorCode.PAYMENT_NOT_PENDING]: "Bu to'lov allaqachon tasdiqlangan yoki rad etilgan.",
  [ErrorCode.PAYMENT_ALREADY_REVERSED]: "Bu to'lov allaqachon qaytarilgan.",
  [ErrorCode.PAYMENT_DATE_OUT_OF_RANGE]: "To'lov sanasini 7 kundan ortiq orqaga qo'yib bo'lmaydi.",

  [ErrorCode.CASH_ENTRY_NOT_MANUAL]:
    "Avtomatik yozuv tahrirlanmaydi. Savdo yoki to'lovni qaytarish orqali tuzating.",
  [ErrorCode.CASH_ENTRY_NOT_TODAY]: "Kechagi yozuv tahrirlanmaydi. Teskari yozuv qo'shing.",
  [ErrorCode.CASH_ACCOUNT_CURRENCY_MISMATCH]: 'Summa valyutasi hisob valyutasiga mos emas.',
  [ErrorCode.CASH_EXCHANGE_SAME_CURRENCY]: 'Ayirboshlash uchun ikki xil valyutadagi hisob tanlang.',
  [ErrorCode.CASH_OPENING_BALANCE_EXISTS]:
    "Bu hisob uchun boshlang'ich qoldiq allaqachon kiritilgan.",

  [ErrorCode.INVENTORY_DUPLICATE_IMEI]: 'Bu IMEI allaqachon bazada bor.',
  [ErrorCode.INVENTORY_ITEM_NOT_AVAILABLE]: 'Bu ombor birligi sotuvga tayyor emas.',
  [ErrorCode.INVENTORY_COST_CURRENCY_MISMATCH]:
    "Tannarx valyutasi mahsulot valyutasiga mos bo'lishi kerak.",

  [ErrorCode.CATALOG_DUPLICATE_NAME]: 'Bunday nom allaqachon mavjud.',
  [ErrorCode.CUSTOMER_PHONE_TAKEN]: 'Bu telefon raqami boshqa mijozda bor.',
  [ErrorCode.EXCHANGE_RATE_MISSING]: 'Valyuta kursi topilmadi. Sozlamalarda kursni kiriting.',
  [ErrorCode.EXCHANGE_RATE_CBU_MISSING]:
    "Bu sana uchun CBU kursi olinmagan — qaytarish uchun asos yo'q.",
  [ErrorCode.EXCHANGE_RATE_FETCH_FAILED]:
    "CBU javob bermadi. Oxirgi ma'lum kurs saqlanib qoldi — birozdan keyin urinib ko'ring.",

  [ErrorCode.FILE_TOO_LARGE]: 'Fayl 10 MB dan katta.',
  [ErrorCode.FILE_TYPE_NOT_ALLOWED]: 'Bu turdagi fayl qabul qilinmaydi.',
};

/**
 * Xatoni foydalanuvchiga ko'rsatiladigan matnga aylantiradi.
 *
 * Tartib: lug'atdagi matn → serverning o'z matni → umumiy zaxira.
 * Serverning matni zaxira sifatida ishlatiladi, chunki u yangi kodni
 * lug'atga qo'shishdan oldin ham ma'noli javob beradi.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return ERROR_MESSAGES[error.code] ?? error.message ?? FALLBACK_MESSAGE;
  }
  return FALLBACK_MESSAGE;
}

export const FALLBACK_MESSAGE = "Nimadir noto'g'ri ketdi. Qayta urinib ko'ring.";

/** Bo'sh holat matnlari (`FRONTEND.md` §7). */
export const EMPTY_MESSAGES = {
  sales: { title: "Hali savdo yo'q", action: "Birinchi savdoni qo'shing" },
  filtered: { title: "Bu filtr bo'yicha topilmadi", action: 'Filtrni tozalash' },
  customers: { title: "Hali mijoz yo'q", action: "Birinchi mijozni qo'shing" },
  inventory: { title: "Ombor bo'sh", action: 'Mahsulot qabul qilish' },
} as const;
