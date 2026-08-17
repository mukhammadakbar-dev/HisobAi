-- ═══════════════════════════════════════════════════════════════════════════
-- Fayl havolalari uchun kompozit tenant FK (§21, ARCHITECTURE.md §7)
--
-- MUAMMO: PostgreSQL'ning referensial butunlik (RI) triggerlari RLS'ni
-- chetlab o'tadi. Shu sababli `products.image_file_id` ga BOSHQA Shop'ning
-- `files.id` sini yozish DB darajasida to'silmayotgan edi — faqat servis
-- kodi to'sardi. `payment_schedules -> installment_contracts` da bu muammo
-- allaqachon kompozit FK bilan yechilgan; ayni o'sha namuna fayllarga
-- ko'chiriladi.
--
-- YECHIM: `files` ga `(id, shop_id)` unique kaliti va har bir fayl havolasi
-- uchun `(<file_col>, shop_id) REFERENCES files(id, shop_id)` FK.
-- MATCH SIMPLE semantikasi: `<file_col>` NULL bo'lsa FK tekshirilmaydi, ya'ni
-- ixtiyoriy havolalar ixtiyoriy qoladi.
--
-- YANGI USTUN / JADVAL / ENUM YO'Q. RLS siyosatlari o'zgarmaydi.
--
-- `onDelete` bo'yicha MAJBURIY o'zgarish (jimgina emas, ataylab):
--   avval `products.image`, `customers.passport_file`, `payments.receipt_file`
--   va `cash_entries.attachment` da `ON DELETE SET NULL` bor edi. Kompozit
--   FK da `SET NULL` IKKI ustunni ham NULL qilardi — shu bilan `shop_id`
--   (NOT NULL) ni buzardi. PostgreSQL 15+ dagi `ON DELETE SET NULL (col)`
--   shakli buni yechardi, lekin Prisma uni ifodalay olmaydi va har
--   `migrate dev` da doimiy drift bo'lardi. Shuning uchun `ON DELETE RESTRICT`
--   tanlandi — `documents.file` bilan bir xil xatti-harakat. Kodda `files`
--   qatorini o'chiradigan yo'l hozir umuman yo'q, ya'ni amalda yo'qotish nol;
--   kelajakda fayl o'chirish kerak bo'lsa, avval havola tozalanadi.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────── 0-QISM — ma'lumot tekshiruvi ───────────────────────
-- Eski bir-ustunli FK mavjudligini kafolatlagani uchun "osilgan" havola
-- bo'lishi mumkin emas; yagona mumkin buzilish — tenantlar orasida ketgan
-- havola. Uni bu migratsiya TUZATMAYDI:
--   * migratsiya roli `hisobai_migrate` jadvallarning EGASI, `FORCE ROW LEVEL
--     SECURITY` esa egaga ham qo'llanadi — `app.current_shop_id` o'rnatilmagan
--     holatda UPDATE hech bir qatorni ko'rmaydi, ya'ni "backfill" jimgina
--     ishlamagan bo'lardi (eng yomon variant);
--   * `documents.file_id` NOT NULL — uni NULL qilib "tuzatish" mumkin emas;
--   * tenant chegarasi buzilgan qator — bu hodisa, odam ko'rishi kerak.
-- Shuning uchun: agar shu rol ko'radigan qamrovda buzuq qator bo'lsa,
-- FK xatosining o'rniga o'qiladigan diagnostika beriladi.
DO $$
DECLARE
    bad_count bigint;
BEGIN
    SELECT
        (SELECT count(*) FROM products p
           WHERE p.image_file_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM files f WHERE f.id = p.image_file_id AND f.shop_id = p.shop_id))
      + (SELECT count(*) FROM customers c
           WHERE c.passport_file_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM files f WHERE f.id = c.passport_file_id AND f.shop_id = c.shop_id))
      + (SELECT count(*) FROM payments pm
           WHERE pm.receipt_file_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM files f WHERE f.id = pm.receipt_file_id AND f.shop_id = pm.shop_id))
      + (SELECT count(*) FROM cash_entries ce
           WHERE ce.attachment_file_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM files f WHERE f.id = ce.attachment_file_id AND f.shop_id = ce.shop_id))
      + (SELECT count(*) FROM documents d
           WHERE NOT EXISTS (SELECT 1 FROM files f WHERE f.id = d.file_id AND f.shop_id = d.shop_id))
    INTO bad_count;

    IF bad_count > 0 THEN
        RAISE EXCEPTION 'Tenant chegarasi buzilgan fayl havolasi: % qator. Kompozit FK qo''yishdan oldin ularni qo''lda ko''rib chiqing (havolani NULL qiling yoki faylni to''g''ri Shop ostida qayta yuklang).', bad_count;
    END IF;
END
$$;

-- ─────────────────── 1-QISM — eski bir-ustunli FK'larni olib tashlash ───────────────────
ALTER TABLE "cash_entries" DROP CONSTRAINT "cash_entries_attachment_file_id_fkey";
ALTER TABLE "customers" DROP CONSTRAINT "customers_passport_file_id_fkey";
ALTER TABLE "documents" DROP CONSTRAINT "documents_file_id_fkey";
ALTER TABLE "payments" DROP CONSTRAINT "payments_receipt_file_id_fkey";
ALTER TABLE "products" DROP CONSTRAINT "products_image_file_id_fkey";
-- `shops_logo_file_id_fkey` O'ZGARMAYDI — 3-QISM izohiga qarang.

-- ─────────────────── 2-QISM — kompozit FK uchun unique kalit ───────────────────
CREATE UNIQUE INDEX "files_id_shop_id_key" ON "files"("id", "shop_id");

-- ─────────────────── 3-QISM — kompozit FK'lar ───────────────────
-- `shops.logo_file_id` QAMROVDAN CHIQARILDI (ataylab, jimgina emas).
-- To'g'ri kalit `(logo_file_id, id) -> files(id, shop_id)` bo'lardi — `shops`
-- tenantning o'zi, shuning uchun ikkinchi ustun `shops.id`. SQL darajasida bu
-- ishlaydi, lekin Prisma'da `shops.id` relation-skalyariga aylanadi va Prisma
-- bunday maydonni `create` kirish tipidan olib tashlaydi: `@default(uuid())`
-- qo'llanmay `id = NULL` yuboriladi va HAR QANDAY `shop.create()` yiqiladi
-- (izolyatsiya to'plamida amalda tekshirildi: "Null constraint violation").
-- FK'ni faqat SQL'da qoldirish ham yaramaydi — Prisma FK'ni ko'radi va
-- keyingi `migrate diff/dev` uni DROP qiladi (doimiy drift).
-- Keyingi qadam sifatida taklif: `shops` ga BEFORE INSERT/UPDATE trigger
-- (§18.3 IMEI triggeri namunasi) — triggerlarni Prisma ko'rmaydi, drift yo'q.
ALTER TABLE "products" ADD CONSTRAINT "products_image_file_id_shop_id_fkey" FOREIGN KEY ("image_file_id", "shop_id") REFERENCES "files"("id", "shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customers" ADD CONSTRAINT "customers_passport_file_id_shop_id_fkey" FOREIGN KEY ("passport_file_id", "shop_id") REFERENCES "files"("id", "shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_receipt_file_id_shop_id_fkey" FOREIGN KEY ("receipt_file_id", "shop_id") REFERENCES "files"("id", "shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_attachment_file_id_shop_id_fkey" FOREIGN KEY ("attachment_file_id", "shop_id") REFERENCES "files"("id", "shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "documents" ADD CONSTRAINT "documents_file_id_shop_id_fkey" FOREIGN KEY ("file_id", "shop_id") REFERENCES "files"("id", "shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Yangi indeks QO'SHILMADI: RI tekshiruvi (`ON DELETE RESTRICT`) uchun har bir
-- fayl ustunida allaqachon bir-ustunli unique indeks bor
-- (`products.image_file_id` va boshqalar `@unique`), `documents` da
-- `documents_contract_id_version_key` + `documents_shop_id_idx` bor.
