import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * So'rov davomida qaysi Shop (tenant) kontekstida ekanligini olib yuradi
 * (§14.4, §21.7). `AsyncLocalStorage` tanlangan sabab: Node'da global
 * o'zgaruvchi ikki parallel so'rov o'rtasida aralashib ketardi, qiymatni
 * `Request` obyektiga osib qo'yish esa `PrismaService`'ni Express'ning
 * `Request`'iga bog'liq qilardi — servis va extension qatlamida u yo'q,
 * faqat controller/middleware qatlamida bor.
 *
 * Bu yerda ikkita **har xil** holat bor, ikkalasi ham "shopId yo'q" bilan
 * chalkashtirilmasligi kerak:
 *
 *  - **kontekst umuman kiritilmagan** (`storage.getStore() === undefined`)
 *    — hali hech kim scope ochmagan (masalan so'rov middleware/interceptor
 *    bosqichiga hali yetib bormagan, yoki foydalanuvchi Shop'siz — §21.10);
 *  - **ataylab scope'siz** (`runWithoutShopScope`) — chaqiruvchi ONGLI
 *    ravishda tenant chegarasidan chiqqan (§14.4 qoida 3, faqat kelajakdagi
 *    `Platform` moduli uchun).
 *
 * `PrismaService` bu ikkisini har xil ko'radi: birinchisi `SHOP_CONTEXT_MISSING`
 * xatosi, ikkinchisi — ataylab ruxsat berilgan yo'l.
 */
type ShopContextStore = { readonly shopId: string } | { readonly noScope: true };

const storage = new AsyncLocalStorage<ShopContextStore>();

/**
 * So'rov davomida Shop kontekstini ochadi.
 *
 * **Faqat `request.user.shopId`dan chaqiriladi** (`shop-context.interceptor.ts`),
 * hech qachon so'rov parametri yoki sarlavhadan emas (§25.12) — client
 * qaysi tenant ekanini o'zi tanlamaydi.
 */
export function runWithShopScope<T>(shopId: string, fn: () => T): T {
  return storage.run({ shopId }, fn);
}

/**
 * **Aniq nomlangan chiqish yo'li** (§14.4 qoida 3). Ushbu funksiya —
 * kod bazasida tenant chegarasini ataylab o'chiradigan YAGONA joy bo'lib
 * qolishi shart: kodni ko'rib chiquvchi `grep -r runWithoutShopScope` bilan
 * "kim va nega scope'ni o'chirdi" degan savolga to'liq javob topsin.
 *
 * Faqat kelajakdagi `Platform` moduli ishlatadi — `PlatformAdmin`'da
 * Shop konteksti umuman yo'q (§21.3), lekin u baribir platforma darajasidagi
 * so'rov yuborishi kerak bo'ladi (masalan barcha Shop'lar ro'yxati).
 */
export function runWithoutShopScope<T>(fn: () => T): T {
  return storage.run({ noScope: true }, fn);
}

/** Joriy Shop id. Kontekst kiritilmagan yoki ataylab scope'siz bo'lsa — `null`. */
export function getShopId(): string | null {
  const store = storage.getStore();
  return store !== undefined && 'shopId' in store ? store.shopId : null;
}

/**
 * `getShopId()` bilan bir xil manbadan o'qiydi, lekin kontekst yo'q bo'lsa
 * jim `null` qaytarish o'rniga xato tashlaydi.
 *
 * `PrismaService` o'zining `SHOP_CONTEXT_MISSING` tekshiruvini mustaqil
 * bajaradi (`$allOperations` ichida) — bu funksiya undan ALOHIDA va faqat
 * Prisma'dan tashqarida Shop id'ga to'g'ridan-to'g'ri muhtoj bo'lgan kam
 * sonli joylar uchun (masalan fayl saqlash yo'lini tuzishda).
 */
export function requireShopId(): string {
  const shopId = getShopId();
  if (shopId === null) {
    throw new Error(
      "Shop konteksti yo'q — requireShopId() runWithShopScope() tashqarisida chaqirildi.",
    );
  }
  return shopId;
}

/**
 * `PrismaService` uchun ichki yordamchi: hozir ataylab scope'siz blok
 * ichidamizmi. Boshqa joyda ishlatilmaydi — buni tekshirish kerak bo'lgan
 * yagona joy `$allOperations`: u kontekst yo'qligini xato deb hisoblaydi,
 * lekin ataylab scope'sizlikni emas.
 */
export function isNoShopScope(): boolean {
  const store = storage.getStore();
  return store !== undefined && 'noScope' in store;
}
