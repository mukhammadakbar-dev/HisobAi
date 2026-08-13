-- §21 (DECISIONS.md, 6-bosqich) — bitta do'kon CRM'idan ko'p tenantli SaaS'ga.
--
-- Bu migratsiya QO'LDA yozilgan (`prisma migrate dev --create-only` bilan
-- boshlab, keyin backfill uchun qayta tuzilgan): dev bazada haqiqiy ma'lumot
-- bor (1 foydalanuvchi, 1 mahsulot, 1 savdo, 4 kurs qatori va h.k.), avtomatik
-- generatsiya esa `shop_id` ustunlarini to'g'ridan-to'g'ri NOT NULL qilib
-- qo'ygan bo'lardi — bo'sh bo'lmagan jadvalda bu muvaffaqiyatsiz bo'ladi.
--
-- TARTIB (majburiy):
--   1) Yangi enum va platforma/Shop jadvallari
--   2) Yagona `settings` qatoridan bitta `Shop` yaratish
--   3) Mavjud SHOP_ADMIN'ni shu Shop'ga bog'lash
--   4) `exchange_rates`ni `cbu_rates` + `shop_exchange_rates`ga ko'chirish
--   5) Barcha biznes jadvalga `shop_id` NULLABLE qo'shish va BACKFILL qilish
--   6) Faqat SHUNDAN KEYIN — NOT NULL, unique, FK, trigger, CHECK
--
-- NOT NULL'ni backfill'dan oldin qo'yish bo'sh bo'lmagan jadvalda muvaffaqiyatsiz
-- bo'ladi — shu sabab qat'iy tartib saqlanadi.

-- ═══════════════════════ 1-QISM — Enum va yangi jadvallar ═══════════════════════

-- §21.6 — `users.is_active` (Boolean) o'rniga yagona status manbai.
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISABLED');

-- §21.2 — `OWNER` va `SHOP_ADMIN` bitta rolni anglatadi: qo'shimcha qiymat
-- emas, QAYTA NOMLASH. `RENAME VALUE` mavjud qatorlarni ham, `role`
-- ustunidagi DEFAULT'ni ham o'zgartirmasdan yangilaydi (enum OID saqlanadi).
ALTER TYPE "UserRole" RENAME VALUE 'OWNER' TO 'SHOP_ADMIN';

-- §21.3, §25.20 — SUPERADMIN alohida jadvalda: business jadvallarga relation
-- YO'Q, `shop_id` UMUMAN YO'Q. Bu kod tekshiruviga emas, strukturaga
-- tayangan kafolat.
CREATE TABLE "platform_admins" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "platform_sessions" (
    "id" UUID NOT NULL,
    "platform_admin_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_sessions_pkey" PRIMARY KEY ("id")
);

-- §21.4 — eski `settings` (id=1, bitta qator) endi `shops`: har Shop uchun
-- alohida qator.
CREATE TABLE "shops" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'HisobAI',
    "logo_file_id" UUID,
    "address" TEXT,
    "phone" TEXT,
    "work_start" TEXT NOT NULL DEFAULT '09:00',
    "work_end" TEXT NOT NULL DEFAULT '19:00',
    "weekend_days" INTEGER[] DEFAULT ARRAY[0]::INTEGER[],
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 3,
    "default_installment_months" INTEGER NOT NULL DEFAULT 6,
    "default_down_payment_percent" DECIMAL(5,2) NOT NULL DEFAULT 30,
    "store_rate_markup_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "reminder_hour" INTEGER NOT NULL DEFAULT 9,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- §21.5, §14.6 — kurs ikkiga bo'lindi: platforma darajasida `cbu_rates`.
CREATE TABLE "cbu_rates" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "fetched_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cbu_rates_pkey" PRIMARY KEY ("id")
);

-- Shop darajasida `shop_exchange_rates`.
CREATE TABLE "shop_exchange_rates" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "store_rate" DECIMAL(12,4) NOT NULL,
    "source" "ExchangeRateSource" NOT NULL DEFAULT 'CBU',
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shop_exchange_rates_pkey" PRIMARY KEY ("id")
);

-- ═══════════════════════ 2-QISM — Ma'lumot ko'chirish (backfill) ═══════════════════════

-- 2.1 — yagona `settings` qatoridan bitta `Shop` yaratish (§21 backfill 1-qadam).
-- `settings.id = 1` ataylab bitta qator bo'lgani uchun bu INSERT doim aynan
-- bitta qator qo'shadi — keyingi bosqichlarda "(SELECT id FROM shops LIMIT 1)"
-- xavfsiz, chunki migratsiya bir marta, aynan shu holatda ishlaydi.
INSERT INTO "shops" (
    "id", "name", "logo_file_id", "address", "phone",
    "work_start", "work_end", "weekend_days", "low_stock_threshold",
    "default_installment_months", "default_down_payment_percent",
    "store_rate_markup_percent", "reminder_hour",
    "updated_by_id", "created_at", "updated_at"
)
SELECT
    gen_random_uuid(), "shop_name", "logo_file_id", "address", "phone",
    "work_start", "work_end", "weekend_days", "low_stock_threshold",
    "default_installment_months", "default_down_payment_percent",
    "store_rate_markup_percent", "reminder_hour",
    "updated_by_id", CURRENT_TIMESTAMP, "updated_at"
FROM "settings";

-- Bo'sh bazada (settings'da qator bo'lmasa — masalan yangi environment) bitta
-- standart Shop bo'lmasligi kerak emas; keyingi CI/test bazalarida `settings`
-- ham bo'sh bo'lishi mumkin, bu holda hech narsa INSERT qilinmaydi va
-- quyidagi backfill'lar ham no-op bo'ladi (jadvallar bo'sh).

-- 2.2 — mavjud SHOP_ADMIN'ni shu Shop'ga bog'lash (§21 backfill 2-qadam).
-- §21.6 — `is_active` o'rniga `status`: TRUE -> ACTIVE, FALSE -> DISABLED
-- (SUSPENDED emas: eski modelda "vaqtincha to'xtatish" tushunchasi yo'q edi —
-- `isActive=false` doim "hisobga kirish butunlay yopilgan" degani edi).
ALTER TABLE "users" ADD COLUMN "shop_id" UUID;
ALTER TABLE "users" ADD COLUMN "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "users" SET "status" = CASE WHEN "is_active" THEN 'ACTIVE'::"AccountStatus" ELSE 'DISABLED'::"AccountStatus" END;
UPDATE "users" SET "shop_id" = (SELECT "id" FROM "shops" LIMIT 1);
ALTER TABLE "users" DROP COLUMN "is_active";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'SHOP_ADMIN';

-- 2.3 — §21.5: `exchange_rates` ni ikkiga bo'lib ko'chirish.
-- `cbu_rate` va `fetched_at` ikkalasi ham to'ldirilgan qatorlardan `cbu_rates`
-- ga (muvaffaqiyatli sync'ning o'zi — §1.5 semantikasi shu yerda qator
-- mavjudligi orqali ifodalanadi). `store_rate` HAR doim mavjud bo'lgani
-- uchun barcha qatordan `shop_exchange_rates`ga ko'chiriladi.
INSERT INTO "cbu_rates" ("id", "date", "rate", "fetched_at")
SELECT gen_random_uuid(), "date", "cbu_rate", "fetched_at"
FROM "exchange_rates"
WHERE "cbu_rate" IS NOT NULL AND "fetched_at" IS NOT NULL;

INSERT INTO "shop_exchange_rates" ("id", "shop_id", "date", "store_rate", "source", "updated_by_id", "created_at", "updated_at")
SELECT gen_random_uuid(), (SELECT "id" FROM "shops" LIMIT 1), "date", "store_rate", "source", "updated_by_id", "created_at", "updated_at"
FROM "exchange_rates";

DROP TABLE "exchange_rates";
DROP TABLE "settings";

-- 2.4 — qolgan barcha biznes jadvalga `shop_id` NULLABLE qo'shib, bitta
-- Shop'dan BACKFILL qilish (§21 backfill 3-qadam). `audit_logs` bundan
-- mustasno: u NULLABLE bo'lib qoladi (§25.17 — SUPERADMIN account-level
-- amallari uchun), lekin mavjud (single-tenant davridagi) yozuvlar ham shu
-- Shop'ga tegishli bo'lgani uchun ular ham backfill qilinadi.
DO $$
DECLARE
    shop_uuid UUID := (SELECT "id" FROM "shops" LIMIT 1);
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'categories', 'brands', 'products', 'inventory_items', 'inventory_batches',
        'stock_movements', 'stocktakes', 'stocktake_lines', 'customers', 'sales',
        'sale_items', 'installment_contracts', 'payment_schedules', 'payments',
        'payment_allocations', 'cash_accounts', 'cash_categories', 'cash_entries',
        'cash_exchanges', 'files', 'documents', 'notification_logs',
        'push_subscriptions', 'audit_logs'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN "shop_id" UUID', tbl);
        IF shop_uuid IS NOT NULL THEN
            EXECUTE format('UPDATE %I SET "shop_id" = $1', tbl) USING shop_uuid;
        END IF;
    END LOOP;
END $$;

-- 2.5 — `sale_counters`: PK (§21.9) o'zgarishi uchun ham backfill kerak.
ALTER TABLE "sale_counters" ADD COLUMN "shop_id" UUID;
UPDATE "sale_counters" SET "shop_id" = (SELECT "id" FROM "shops" LIMIT 1);

-- 2.6 — `idempotency_keys`: PK `key` dan `id` ga o'tadi (§21.11), `shop_id`
-- qo'shiladi.
ALTER TABLE "idempotency_keys" ADD COLUMN "id" UUID;
ALTER TABLE "idempotency_keys" ADD COLUMN "shop_id" UUID;
UPDATE "idempotency_keys" SET "id" = gen_random_uuid(), "shop_id" = (SELECT "id" FROM "shops" LIMIT 1);

-- ═══════════════════════ 3-QISM — NOT NULL, PK/unique almashtirish ═══════════════════════

DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'categories', 'brands', 'products', 'inventory_items', 'inventory_batches',
        'stock_movements', 'stocktakes', 'stocktake_lines', 'customers', 'sales',
        'sale_items', 'installment_contracts', 'payment_schedules', 'payments',
        'payment_allocations', 'cash_accounts', 'cash_categories', 'cash_entries',
        'cash_exchanges', 'files', 'documents', 'notification_logs',
        'push_subscriptions', 'sale_counters', 'idempotency_keys'
        -- 'audit_logs' bundan mustasno: shop_id §25.17 bo'yicha ataylab NULLABLE
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE %I ALTER COLUMN "shop_id" SET NOT NULL', tbl);
    END LOOP;
END $$;

ALTER TABLE "idempotency_keys" ALTER COLUMN "id" SET NOT NULL;

-- `sale_counters` PK: (year) -> (shop_id, year) (§21.9)
ALTER TABLE "sale_counters" DROP CONSTRAINT "sale_counters_pkey";
ALTER TABLE "sale_counters" ADD CONSTRAINT "sale_counters_pkey" PRIMARY KEY ("shop_id", "year");

-- `idempotency_keys` PK: (key) -> (id), unique (shop_id, key) (§21.11)
ALTER TABLE "idempotency_keys" DROP CONSTRAINT "idempotency_keys_pkey";
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id");

-- ═══════════════════════ 4-QISM — global unique -> shop-scoped ═══════════════════════
-- (§21 — "bu ro'yxat to'liq bajarilishi shart")

DROP INDEX "customers_phone_primary_key";
DROP INDEX "categories_slug_key";
DROP INDEX "brands_slug_key";
DROP INDEX "cash_categories_slug_key";
DROP INDEX "cash_accounts_name_currency_key";
DROP INDEX "inventory_items_imei_1_key";
DROP INDEX "inventory_items_imei_2_key";
DROP INDEX "inventory_items_serial_number_key";
DROP INDEX "sales_number_key";
DROP INDEX "idempotency_keys_created_at_idx";

-- Eski oddiy indekslar ham shop-scoped nusxasi bilan almashtiriladi
-- (birinchi ustun `shop_id` — Shop bo'yicha filtrlashni tezlashtiradi, chunki
-- extension (§21.7, keyingi bosqich) HAR bir so'rovga `shop_id` qo'shadi).
DROP INDEX "audit_logs_action_created_at_idx";
DROP INDEX "audit_logs_actor_id_created_at_idx";
DROP INDEX "audit_logs_created_at_idx";
DROP INDEX "audit_logs_entity_type_entity_id_idx";
DROP INDEX "cash_entries_account_id_occurred_at_idx";
DROP INDEX "cash_entries_occurred_at_idx";
DROP INDEX "cash_entries_payment_id_idx";
DROP INDEX "cash_entries_source_type_source_id_idx";
DROP INDEX "cash_exchanges_occurred_at_idx";
DROP INDEX "customers_full_name_idx";
DROP INDEX "customers_phone_secondary_idx";
DROP INDEX "installment_contracts_status_idx";
DROP INDEX "inventory_batches_product_id_received_at_idx";
DROP INDEX "inventory_items_product_id_status_idx";
DROP INDEX "notification_logs_status_scheduled_for_idx";
DROP INDEX "payment_allocations_payment_id_idx";
DROP INDEX "payment_allocations_schedule_id_idx";
DROP INDEX "payment_schedules_due_date_status_idx";
DROP INDEX "payments_cash_account_id_paid_at_idx";
DROP INDEX "payments_contract_id_status_idx";
DROP INDEX "payments_sale_id_status_idx";
DROP INDEX "payments_status_paid_at_idx";
DROP INDEX "products_brand_id_model_idx";
DROP INDEX "products_display_name_idx";
DROP INDEX "push_subscriptions_user_id_idx";
DROP INDEX "sale_items_inventory_item_id_idx";
DROP INDEX "sale_items_product_id_idx";
DROP INDEX "sale_items_sale_id_idx";
DROP INDEX "sales_customer_id_sold_at_idx";
DROP INDEX "sales_reverses_sale_id_idx";
DROP INDEX "sales_status_sold_at_idx";
DROP INDEX "stock_movements_product_id_occurred_at_idx";
DROP INDEX "stock_movements_type_occurred_at_idx";
DROP INDEX "stocktake_lines_stocktake_id_idx";

-- Yangi platforma/Shop indekslari
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");
CREATE UNIQUE INDEX "platform_sessions_token_hash_key" ON "platform_sessions"("token_hash");
CREATE INDEX "platform_sessions_platform_admin_id_expires_at_idx" ON "platform_sessions"("platform_admin_id", "expires_at");
CREATE UNIQUE INDEX "shops_logo_file_id_key" ON "shops"("logo_file_id");
CREATE UNIQUE INDEX "cbu_rates_date_key" ON "cbu_rates"("date");
CREATE UNIQUE INDEX "shop_exchange_rates_shop_id_date_key" ON "shop_exchange_rates"("shop_id", "date");

-- Shop-scoped indekslar (biznes jadvallar)
CREATE INDEX "audit_logs_shop_id_entity_type_entity_id_idx" ON "audit_logs"("shop_id", "entity_type", "entity_id");
CREATE INDEX "audit_logs_shop_id_actor_id_created_at_idx" ON "audit_logs"("shop_id", "actor_id", "created_at");
CREATE INDEX "audit_logs_shop_id_created_at_idx" ON "audit_logs"("shop_id", "created_at");
CREATE INDEX "audit_logs_shop_id_action_created_at_idx" ON "audit_logs"("shop_id", "action", "created_at");
CREATE INDEX "brands_shop_id_idx" ON "brands"("shop_id");
CREATE UNIQUE INDEX "brands_shop_id_slug_key" ON "brands"("shop_id", "slug");
CREATE INDEX "cash_accounts_shop_id_idx" ON "cash_accounts"("shop_id");
CREATE UNIQUE INDEX "cash_accounts_shop_id_name_currency_key" ON "cash_accounts"("shop_id", "name", "currency");
CREATE INDEX "cash_categories_shop_id_idx" ON "cash_categories"("shop_id");
CREATE UNIQUE INDEX "cash_categories_shop_id_slug_key" ON "cash_categories"("shop_id", "slug");
CREATE INDEX "cash_entries_shop_id_account_id_occurred_at_idx" ON "cash_entries"("shop_id", "account_id", "occurred_at");
CREATE INDEX "cash_entries_shop_id_source_type_source_id_idx" ON "cash_entries"("shop_id", "source_type", "source_id");
CREATE INDEX "cash_entries_shop_id_occurred_at_idx" ON "cash_entries"("shop_id", "occurred_at");
CREATE INDEX "cash_entries_shop_id_payment_id_idx" ON "cash_entries"("shop_id", "payment_id");
CREATE INDEX "cash_exchanges_shop_id_occurred_at_idx" ON "cash_exchanges"("shop_id", "occurred_at");
CREATE INDEX "categories_shop_id_idx" ON "categories"("shop_id");
CREATE UNIQUE INDEX "categories_shop_id_slug_key" ON "categories"("shop_id", "slug");
CREATE INDEX "customers_shop_id_full_name_idx" ON "customers"("shop_id", "full_name");
CREATE INDEX "customers_shop_id_phone_secondary_idx" ON "customers"("shop_id", "phone_secondary");
CREATE UNIQUE INDEX "customers_shop_id_phone_primary_key" ON "customers"("shop_id", "phone_primary");
CREATE INDEX "documents_shop_id_idx" ON "documents"("shop_id");
CREATE INDEX "files_shop_id_idx" ON "files"("shop_id");
CREATE INDEX "idempotency_keys_shop_id_created_at_idx" ON "idempotency_keys"("shop_id", "created_at");
CREATE UNIQUE INDEX "idempotency_keys_shop_id_key_key" ON "idempotency_keys"("shop_id", "key");
CREATE INDEX "installment_contracts_shop_id_status_idx" ON "installment_contracts"("shop_id", "status");
CREATE UNIQUE INDEX "installment_contracts_id_shop_id_key" ON "installment_contracts"("id", "shop_id");
CREATE INDEX "inventory_batches_shop_id_product_id_received_at_idx" ON "inventory_batches"("shop_id", "product_id", "received_at");
CREATE INDEX "inventory_items_shop_id_product_id_status_idx" ON "inventory_items"("shop_id", "product_id", "status");
CREATE UNIQUE INDEX "inventory_items_shop_id_imei_1_key" ON "inventory_items"("shop_id", "imei_1");
CREATE UNIQUE INDEX "inventory_items_shop_id_imei_2_key" ON "inventory_items"("shop_id", "imei_2");
CREATE UNIQUE INDEX "inventory_items_shop_id_serial_number_key" ON "inventory_items"("shop_id", "serial_number");
CREATE INDEX "notification_logs_shop_id_status_scheduled_for_idx" ON "notification_logs"("shop_id", "status", "scheduled_for");
CREATE INDEX "payment_allocations_shop_id_payment_id_idx" ON "payment_allocations"("shop_id", "payment_id");
CREATE INDEX "payment_allocations_shop_id_schedule_id_idx" ON "payment_allocations"("shop_id", "schedule_id");
CREATE INDEX "payment_schedules_shop_id_due_date_status_idx" ON "payment_schedules"("shop_id", "due_date", "status");
CREATE INDEX "payments_shop_id_sale_id_status_idx" ON "payments"("shop_id", "sale_id", "status");
CREATE INDEX "payments_shop_id_contract_id_status_idx" ON "payments"("shop_id", "contract_id", "status");
CREATE INDEX "payments_shop_id_status_paid_at_idx" ON "payments"("shop_id", "status", "paid_at");
CREATE INDEX "payments_shop_id_cash_account_id_paid_at_idx" ON "payments"("shop_id", "cash_account_id", "paid_at");
CREATE UNIQUE INDEX "payments_id_shop_id_key" ON "payments"("id", "shop_id");
CREATE INDEX "products_shop_id_brand_id_model_idx" ON "products"("shop_id", "brand_id", "model");
CREATE INDEX "products_shop_id_display_name_idx" ON "products"("shop_id", "display_name");
CREATE INDEX "push_subscriptions_shop_id_user_id_idx" ON "push_subscriptions"("shop_id", "user_id");
CREATE INDEX "sale_items_shop_id_sale_id_idx" ON "sale_items"("shop_id", "sale_id");
CREATE INDEX "sale_items_shop_id_product_id_idx" ON "sale_items"("shop_id", "product_id");
CREATE INDEX "sale_items_shop_id_inventory_item_id_idx" ON "sale_items"("shop_id", "inventory_item_id");
CREATE INDEX "sales_shop_id_status_sold_at_idx" ON "sales"("shop_id", "status", "sold_at");
CREATE INDEX "sales_shop_id_customer_id_sold_at_idx" ON "sales"("shop_id", "customer_id", "sold_at");
CREATE INDEX "sales_shop_id_reverses_sale_id_idx" ON "sales"("shop_id", "reverses_sale_id");
CREATE UNIQUE INDEX "sales_id_shop_id_key" ON "sales"("id", "shop_id");
CREATE UNIQUE INDEX "sales_shop_id_number_key" ON "sales"("shop_id", "number");
CREATE INDEX "stock_movements_shop_id_product_id_occurred_at_idx" ON "stock_movements"("shop_id", "product_id", "occurred_at");
CREATE INDEX "stock_movements_shop_id_type_occurred_at_idx" ON "stock_movements"("shop_id", "type", "occurred_at");
CREATE INDEX "stocktake_lines_shop_id_stocktake_id_idx" ON "stocktake_lines"("shop_id", "stocktake_id");
CREATE INDEX "stocktakes_shop_id_idx" ON "stocktakes"("shop_id");
CREATE UNIQUE INDEX "stocktakes_id_shop_id_key" ON "stocktakes"("id", "shop_id");
CREATE UNIQUE INDEX "users_shop_id_key" ON "users"("shop_id");

-- ═══════════════════════ 5-QISM — Foreign key'lar ═══════════════════════

ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_platform_admin_id_fkey" FOREIGN KEY ("platform_admin_id") REFERENCES "platform_admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shops" ADD CONSTRAINT "shops_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "shops" ADD CONSTRAINT "shops_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shop_exchange_rates" ADD CONSTRAINT "shop_exchange_rates_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shop_exchange_rates" ADD CONSTRAINT "shop_exchange_rates_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "brands" ADD CONSTRAINT "brands_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- §21 — kompozit FK'lar: bola qatorining `shop_id`si ota'nikidan farq
-- qila olmaydi (`@@unique([id, shopId])` ota ustida + kompozit FK bolada).
-- Eski bir ustunli FK'lar avval OLIB TASHLANADI — aks holda ular yangi
-- kompozit FK bilan bir vaqtda turib, ortiqcha (va qisqaroq, shop_id'ni
-- hisobga olmaydigan) yo'l qoldirardi.
ALTER TABLE "stocktake_lines" DROP CONSTRAINT "stocktake_lines_stocktake_id_fkey";
ALTER TABLE "sale_items" DROP CONSTRAINT "sale_items_sale_id_fkey";
ALTER TABLE "payment_schedules" DROP CONSTRAINT "payment_schedules_contract_id_fkey";
ALTER TABLE "payment_allocations" DROP CONSTRAINT "payment_allocations_payment_id_fkey";

ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_stocktake_id_shop_id_fkey" FOREIGN KEY ("stocktake_id", "shop_id") REFERENCES "stocktakes"("id", "shop_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stocktake_lines" ADD CONSTRAINT "stocktake_lines_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_counters" ADD CONSTRAINT "sale_counters_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_shop_id_fkey" FOREIGN KEY ("sale_id", "shop_id") REFERENCES "sales"("id", "shop_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "installment_contracts" ADD CONSTRAINT "installment_contracts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_contract_id_shop_id_fkey" FOREIGN KEY ("contract_id", "shop_id") REFERENCES "installment_contracts"("id", "shop_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_shop_id_fkey" FOREIGN KEY ("payment_id", "shop_id") REFERENCES "payments"("id", "shop_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_categories" ADD CONSTRAINT "cash_categories_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_exchanges" ADD CONSTRAINT "cash_exchanges_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "files" ADD CONSTRAINT "files_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════ 6-QISM — CHECK cheklovlari (§17.8, shop-scoped) ═══════════════════════

-- §3.7-3.9, §16.2 — eski `settings_*` cheklovlari `shops` ustida takrorlanadi
-- (jadval o'chirilganda ular ham o'chgan edi).
ALTER TABLE "shops" ADD CONSTRAINT "shops_weekend_days_valid"
  CHECK ("weekend_days" <@ ARRAY[0,1,2,3,4,5,6]);
ALTER TABLE "shops" ADD CONSTRAINT "shops_ranges_valid"
  CHECK ("default_down_payment_percent" BETWEEN 0 AND 100
     AND "store_rate_markup_percent"    BETWEEN 0 AND 100
     AND "reminder_hour"                BETWEEN 0 AND 23
     AND "default_installment_months"   > 0
     AND "low_stock_threshold"          >= 0);

-- Eski `exchange_rates_*_positive` cheklovlari ikkiga bo'lingan jadvalda.
ALTER TABLE "cbu_rates" ADD CONSTRAINT "cbu_rates_rate_positive"
  CHECK ("rate" > 0);
ALTER TABLE "shop_exchange_rates" ADD CONSTRAINT "shop_exchange_rates_store_rate_positive"
  CHECK ("store_rate" > 0);

-- ═══════════════════════ 7-QISM — Trigger'larni shop_id bilan qayta yozish ═══════════════════════

-- §18.3, §21 — IMEI/serial ustunlararo takrorlanish triggeri endi Shop
-- ICHIDA solishtiradi va advisory lock kaliti ham `shop_id` bilan
-- birlashtiriladi: boshqa Shop'dagi qabul buni kutib turmaydi (§21.8).
CREATE OR REPLACE FUNCTION check_inventory_identifier_unique() RETURNS TRIGGER AS $$
DECLARE
  identifier text;
  existing_id uuid;
BEGIN
  FOREACH identifier IN ARRAY ARRAY[NEW.imei_1, NEW.imei_2, NEW.serial_number] LOOP
    CONTINUE WHEN identifier IS NULL;

    -- Ikki int4'li shakl (classid, objid): shop_id va identifikator birga
    -- kalitni tashkil qiladi — turli Shop'dagi bir xil IMEI bir-birini
    -- kutmaydi.
    PERFORM pg_advisory_xact_lock(hashtext(NEW.shop_id::text), hashtext(identifier));

    SELECT id INTO existing_id
      FROM "inventory_items"
     WHERE id <> NEW.id
       AND shop_id = NEW.shop_id
       AND (imei_1 = identifier OR imei_2 = identifier OR serial_number = identifier)
     LIMIT 1;

    IF existing_id IS NOT NULL THEN
      -- 23505 = unique_violation: Prisma buni takrorlanish xatosi deb
      -- taniydi, ilova esa INVENTORY_DUPLICATE_IMEI ga aylantiradi
      RAISE EXCEPTION 'IDENTIFIER_ALREADY_EXISTS: % (mavjud birlik: %)', identifier, existing_id
        USING ERRCODE = '23505';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- §21 — jadvallararo valyuta mosligi triggerlari endi Shop mosligini ham
-- tekshiradi: aks holda CHECK "oxirgi himoya qatlami" (§17.8) bo'sh
-- filtrsiz cross-tenant yozuvni sezmasdi.

CREATE OR REPLACE FUNCTION check_cash_entry_currency() RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT currency FROM cash_accounts WHERE id = NEW.account_id) <> NEW.currency THEN
    RAISE EXCEPTION 'cash_entries.currency hisob valyutasiga mos emas (§11.1)';
  END IF;
  IF (SELECT shop_id FROM cash_accounts WHERE id = NEW.account_id) <> NEW.shop_id THEN
    RAISE EXCEPTION 'cash_entries.shop_id hisobning shop''iga mos emas (§21)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_cost_currency() RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT currency FROM products WHERE id = NEW.product_id) <> NEW.cost_currency THEN
    RAISE EXCEPTION 'cost_currency mahsulot valyutasiga mos emas (§1.2, §16.9)';
  END IF;
  IF (SELECT shop_id FROM products WHERE id = NEW.product_id) <> NEW.shop_id THEN
    RAISE EXCEPTION 'shop_id mahsulotning shop''iga mos emas (§21)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_exchange_accounts() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.from_account_id = NEW.to_account_id THEN
    RAISE EXCEPTION 'Ayirboshlash bir hisob ichida bo''lmaydi (§11.6)';
  END IF;
  IF (SELECT currency FROM cash_accounts WHERE id = NEW.from_account_id)
   = (SELECT currency FROM cash_accounts WHERE id = NEW.to_account_id) THEN
    RAISE EXCEPTION 'Ayirboshlash bir xil valyutalar orasida bo''lmaydi (§11.6)';
  END IF;
  IF (SELECT shop_id FROM cash_accounts WHERE id = NEW.from_account_id) <> NEW.shop_id
    OR (SELECT shop_id FROM cash_accounts WHERE id = NEW.to_account_id) <> NEW.shop_id THEN
    RAISE EXCEPTION 'Ayirboshlash hisoblari boshqa shop''ga tegishli (§21)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_contract_currency() RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT currency FROM sales WHERE id = NEW.sale_id) <> NEW.currency THEN
    RAISE EXCEPTION 'installment_contracts.currency savdo valyutasiga mos emas (§9.2)';
  END IF;
  IF (SELECT shop_id FROM sales WHERE id = NEW.sale_id) <> NEW.shop_id THEN
    RAISE EXCEPTION 'installment_contracts.shop_id savdoning shop''iga mos emas (§21)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
