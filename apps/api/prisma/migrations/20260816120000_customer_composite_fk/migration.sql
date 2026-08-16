-- T-01 (KRITIK, ochiq audit topilmasi) — `Sale.customer` va
-- `NotificationLog.customer` bitta ustunli FK edi (faqat `customer_id`).
--
-- Nega bu kritik: tenant chegarasi RLS zimmasida (§21.13) — servis
-- qatlamida qo'lda `where: { shopId }` ATAYLAB yozilmaydi (§21.7).
-- Lekin PostgreSQL FK tekshiruvini jadval EGASI (`hisobai_migrate`)
-- nomidan bajaradi va `FORCE ROW LEVEL SECURITY` faqat jadval
-- EGASI'DAN BOSHQA rollarga qo'llanadi — ya'ni referensial butunlik
-- tekshiruvining o'zi RLS'ni chetlab o'tadi. Natijada Shop A egasi
-- Shop B mijozining UUID'ini bilsa, `customerId` shu UUID bo'lgan
-- savdoni Shop A nomidan yaratishi mumkin edi: FK faqat "customer
-- shu id bilan MAVJUDMI" ni tekshiradi, "shu Shop'gami" ni emas.
--
-- Yechim — loyihada ALLAQACHON bor naqsh (§21, StocktakeLine/Payment/
-- PaymentAllocation): kompozit FK `(customer_id, shop_id)` →
-- `customers(id, shop_id)`. `shop_id` ustuni `customers`da UNIQUE
-- juftlik sifatida ochiladi, bola esa ikkala ustun bilan bog'lanadi —
-- shu bilan bola qatorining `shop_id`si otasinikidan farq QILA
-- OLMAYDI, buni PostgreSQL o'zi bazaviy darajada majburlaydi.
--
-- `onDelete` xatti-harakati o'ZGARTIRILMAGAN:
--  - `sales.customer`            — `Restrict` (o'z holicha).
--  - `notification_logs.customer` — `SetNull` (o'z holicha), lekin
--    kompozit FK'da oddiy `ON DELETE SET NULL` `shop_id`ni ham NULL
--    qilishga urinardi — u ustun `NOT NULL` bo'lgani uchun bu har
--    doim xato berardi (Prisma schema validatori buni ogohlantiradi:
--    "SetNull ... when a referenced field is required"). PostgreSQL
--    15+ dagi ustun-ro'yxatli shakl — `ON DELETE SET NULL (customer_id)`
--    — faqat `customer_id`ni NULL qiladi, `shop_id`ga tegmaydi. Bu
--    aynan `SetNull`ning asl niyatini saqlaydi: mijoz o'chirilsa,
--    eslatma jurnali qatori qoladi, faqat mijoz ko'rsatkichi yo'qoladi.

-- 1) Kompozit FK nishoni: `customers(id, shop_id)` unique juftlik.
--    Naqsh mavjud kompozit-FK ota jadvallari bilan bir xil
--    (`sales_id_shop_id_key`, `installment_contracts_id_shop_id_key`, ...).
CREATE UNIQUE INDEX "customers_id_shop_id_key" ON "customers"("id", "shop_id");

-- 2) Eski bitta ustunli FK'lar olib tashlanadi.
ALTER TABLE "sales" DROP CONSTRAINT "sales_customer_id_fkey";
ALTER TABLE "notification_logs" DROP CONSTRAINT "notification_logs_customer_id_fkey";

-- 3) Kompozit FK'lar qo'yiladi — `onDelete` xatti-harakati o'zgarmaydi.
ALTER TABLE "sales"
  ADD CONSTRAINT "sales_customer_id_shop_id_fkey"
  FOREIGN KEY ("customer_id", "shop_id") REFERENCES "customers"("id", "shop_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_logs"
  ADD CONSTRAINT "notification_logs_customer_id_shop_id_fkey"
  FOREIGN KEY ("customer_id", "shop_id") REFERENCES "customers"("id", "shop_id")
  ON DELETE SET NULL ("customer_id") ON UPDATE CASCADE;
