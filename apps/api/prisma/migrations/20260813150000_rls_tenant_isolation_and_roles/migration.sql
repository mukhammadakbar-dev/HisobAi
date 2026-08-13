-- §21.13, §21.14, §21.16 (DECISIONS.md) — 6-bosqich, 3-qadam: DB darajasidagi
-- kafolat. §21.7/§21.13 rejasi shu yerda haqiqatga aylanadi: extension
-- (ilova qatlami, alohida ishlanmoqda) ergonomikani beradi, bu migratsiya esa
-- KAFOLATNI — RLS va cheklangan DB rollari orqali.
--
-- TARTIB (majburiy, sabablari har bo'limda):
--   1) `shop_id` ustun default'lari — current_setting(...) asosida
--   2) RLS: ENABLE + FORCE, har shop-scoped jadvalda
--   3) Siyosatlar (POLICY) — USING va WITH CHECK ikkalasi ham
--   4) `hisobai_app` / `hisobai_migrate` rollarini yaratish
--   5) Egalikni ko'chirish (RLS jadval egasi uchun ham FORCE bilan ishlaydi,
--      lekin egalik hisobai_migrate'da bo'lishi kerak — postgres superuser
--      RLS'ni baribir chetlab o'tadi, bu ataylab, operator uchun)
--   6) Sxema/baza darajasidagi ruxsatlar va DEFAULT PRIVILEGES
--   7) Jadval darajasidagi ruxsatlar (`hisobai_app`)
--   8) `audit_logs` — INSERT/SELECT bilan cheklash (ARCHITECTURE §12,
--      PERMISSIONS.md §4)
--
-- Rollarga PAROL BU YERDA O'RNATILMAYDI (parol migratsiyaga kirmaydi — u
-- reponi ko'radigan har kim uchun ochiq bo'lardi). Rollar LOGIN huquqi bilan,
-- lekin parolsiz yaratiladi — ya'ni parol qo'yilmaguncha ular orqali ulanib
-- bo'lmaydi (xavfsiz standart holat). Operator qadami hisobotda tavsiflangan.

-- ═══════════════════════ 1-QISM — `shop_id` ustun default'lari ═══════════════════════
--
-- §21.13: default `current_setting('app.current_shop_id', true)::uuid` bo'lsa
-- (a) Prisma create tipida maydon ixtiyoriy bo'ladi (§14.4 ning butun
-- maqsadi), (b) kontekstsiz yozuv NOT NULL buzilishi bilan yiqiladi — "bo'sh
-- filtr bilan ketmaydi" (§14.4) baza darajasida ta'minlanadi.
--
-- `missing_ok = true` — kontekst umuman qo'yilmagan bo'lsa (masalan hozirgi
-- ilova hali extension bilan yozilmagan, yoki migratsiya postgres ostida
-- ishlaydi va ustun aniq qiymat bilan yoziladi) `NULL` qaytaradi, xato emas —
-- xato faqat NOT NULL ustunga NULL yozishga urinilganda keladi, ya'ni
-- ustun aniq berilmagan va kontekst ham yo'q bo'lgan holatdagina.
--
-- `NULLIF(..., '')` — Postgres'ning maxsus (custom) GUC'lariga xos holat
-- uchun: `current_setting('app.x', true)` faqat backend'da bu parametr
-- HECH QACHON tegilmagan bo'lsa `NULL` qaytaradi. Agar bir marta
-- `set_config('app.current_shop_id', ..., true)` chaqirilgan bo'lsa
-- (tranzaksiya doirasida — §21.14), tranzaksiya tugagach qiymat `NULL`ga
-- emas, BO'SH SATRGA (`''`) qaytadi — bu ulanish keyingi so'rovda kontekst
-- qo'yishni unutsa (yoki `runWithoutShopScope()` chaqirilsa), `''::uuid`
-- to'g'ridan-to'g'ri cast xatosi (500) bilan yiqilardi, "bo'sh natija"
-- emas — ulanish pool qayta ishlatilganda xulq-atvor oldingi so'rovlar
-- tarixiga bog'liq bo'lib qolardi. `NULLIF` buni bir xillashtiradi: ikkala
-- holatda ham (hech qachon tegilmagan VA tegilib qayta tushirilgan) natija
-- `NULL` — demak xulq-atvor doim bir xil: NOT NULL ustunda xato, NULLABLE
-- (`audit_logs`) da va RLS siyosatida esa "kontekst yo'q" holati.
DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'categories', 'brands', 'products', 'inventory_items', 'inventory_batches',
        'stock_movements', 'stocktakes', 'stocktake_lines', 'customers', 'sales',
        'sale_items', 'sale_counters', 'installment_contracts', 'payment_schedules',
        'payments', 'payment_allocations', 'cash_accounts', 'cash_categories',
        'cash_entries', 'cash_exchanges', 'files', 'documents', 'notification_logs',
        'push_subscriptions', 'idempotency_keys', 'shop_exchange_rates'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN "shop_id" SET DEFAULT NULLIF(current_setting(''app.current_shop_id'', true), '''')::uuid',
            tbl
        );
    END LOOP;
END $$;

-- `audit_logs.shop_id` — YAGONA NULLABLE istisno (§25.17, ARCHITECTURE §14.5).
-- Shu default baribir foydali: shop-scoped tranzaksiya ichida yozilganda
-- (SHOP_ADMIN amali) `shop_id` chiqarib qoldirilsa ham to'g'ri Shop'ga
-- yoziladi — aks holda u xatosiz `NULL` bo'lib qolardi va platforma
-- yozuvlari orasida "egasiz" bo'lib ko'rinardi (§14.5 ning
-- `AuditService.record` uchun `shopId` majburiy argument talabi shu bilan
-- ikki qatlamli bo'ladi: servis ham, endi ustun default ham). Platforma
-- yo'lida (`runWithoutShopScope()`, SUPERADMIN amali) kontekst yo'q —
-- `NULLIF(current_setting(..., true), '')` `NULL` qaytaradi (yuqoridagi
-- izohga qarang — bo'sh satr holati ham hisobga olinadi), ustun
-- `NULLABLE` bo'lgani uchun bu yerda xato bo'lmaydi va yozuv to'g'ri
-- `shop_id = NULL` bilan yoziladi.
ALTER TABLE "audit_logs" ALTER COLUMN "shop_id" SET DEFAULT NULLIF(current_setting('app.current_shop_id', true), '')::uuid;

-- ═══════════════════════ 2-QISM — Row Level Security: ENABLE + FORCE ═══════════════════════
--
-- Qamrov — ARCHITECTURE §14.5 dagi 25 ta jadval + `idempotency_keys` +
-- `shop_exchange_rates` = 27 ta. RLS QO'YILMAYDI: `users`, `shops`,
-- `platform_admins`, `platform_sessions`, `sessions`, `login_attempts`,
-- `password_reset_tokens`, `cbu_rates` — bular yoki platforma darajasida
-- (Shop'ga umuman aloqasi yo'q), yoki auth qatlami Shop konteksti
-- BOSHLANISHIDAN OLDIN o'qishi shart bo'lgan jadvallar (`users`/`sessions`:
-- login vaqtida `app.current_shop_id` hali yo'q — RLS qo'yilsa login
-- imkonsiz bo'lardi).
--
-- `files` ATAYLAB shu ro'yxatda: ustuni NOT NULL, har fayl AYNAN bitta
-- Shop'ga tegishli (qabul cheki, mahsulot rasmi, pasport nusxasi, do'kon
-- logotipi) — platforma jadvaliga (`platform_admins`/`platform_sessions`)
-- hech qanday `FileAsset` relation'i yo'q. `shops.logo_file_id` `files`ga
-- ishora qilsa-da, bu o'qish har doim so'rovchi SHOP_ADMIN'ning o'z
-- Shop konteksti ichida sodir bo'ladi — cross-Shop yo'l yo'q.
--
-- `FORCE` — jadval egasi (bo'lajak `hisobai_migrate`, §21.16) uchun ham
-- siyosatni majburlaydi. Superuser (`postgres`) baribir chetlab o'tadi —
-- shuning uchun operator to'g'ridan-to'g'ri `postgres` bilan ulanib bu
-- kafolatni "tekshirib" bo'lmaydi; tekshiruv faqat `hisobai_app` ostida.

DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'categories', 'brands', 'products', 'inventory_items', 'inventory_batches',
        'stock_movements', 'stocktakes', 'stocktake_lines', 'customers', 'sales',
        'sale_items', 'sale_counters', 'installment_contracts', 'payment_schedules',
        'payments', 'payment_allocations', 'cash_accounts', 'cash_categories',
        'cash_entries', 'cash_exchanges', 'files', 'documents', 'notification_logs',
        'push_subscriptions', 'idempotency_keys', 'shop_exchange_rates', 'audit_logs'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    END LOOP;
END $$;

-- ═══════════════════════ 3-QISM — Siyosatlar (POLICY) ═══════════════════════
--
-- Har siyosat `FOR ALL` — SELECT/INSERT/UPDATE/DELETE bittasida. `USING`
-- MAVJUD qatorlarni (ko'rinish, UPDATE/DELETE nishoni) filtrlaydi, `WITH
-- CHECK` esa YANGI/YANGILANGAN qator qiymatini tekshiradi. Ikkalasi ham
-- shart: faqat `USING` bo'lsa, boshqa Shop'ning `shop_id`si bilan qator
-- YOZIB bo'lardi (`USING` yozishda tekshirilmaydi) — bu §21.13 ning aynan
-- nazarda tutgan teshigi.
--
-- `NULLIF(..., '')` bu yerda ham — 1-qismdagi izohga qarang. Siyosat
-- ifodasi ustun default'i bilan BIR XIL bo'lishi shart edi: aks holda
-- "kontekst yo'q" holati ustun uchun bitta xulq-atvor (NULL -> NOT NULL
-- xato), siyosat uchun boshqasini (`''::uuid` -> cast xatosi) berardi.
DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'categories', 'brands', 'products', 'inventory_items', 'inventory_batches',
        'stock_movements', 'stocktakes', 'stocktake_lines', 'customers', 'sales',
        'sale_items', 'sale_counters', 'installment_contracts', 'payment_schedules',
        'payments', 'payment_allocations', 'cash_accounts', 'cash_categories',
        'cash_entries', 'cash_exchanges', 'files', 'documents', 'notification_logs',
        'push_subscriptions', 'idempotency_keys', 'shop_exchange_rates'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format(
            'CREATE POLICY "%s_tenant_isolation" ON %I FOR ALL '
            || 'USING ("shop_id" = NULLIF(current_setting(''app.current_shop_id'', true), '''')::uuid) '
            || 'WITH CHECK ("shop_id" = NULLIF(current_setting(''app.current_shop_id'', true), '''')::uuid)',
            tbl, tbl
        );
    END LOOP;
END $$;

-- `audit_logs` — maxsus siyosat, chunki `shop_id` NULLABLE (§25.17).
-- Oddiy tenglik (`shop_id = current_setting(...)`) NULL bilan solishtirishda
-- har doim NULL (yolg'on) beradi — ya'ni kontekstsiz (platforma) o'qishda
-- `shop_id IS NULL` yozuvlar ham KO'RINMAY qolardi, holbuki ular aynan
-- platforma auditining o'zi (`SHOP_ADMIN_CREATED` va h.k., §25.17).
--
-- `IS NOT DISTINCT FROM` NULL'ni NULL bilan TENG deb hisoblaydi:
--   - Shop konteksti bor  + qator shu Shop'niki     -> ko'rinadi (odatdagi hol)
--   - Shop konteksti bor  + qator boshqa Shop'niki   -> ko'rinmaydi
--   - Shop konteksti bor  + qator platforma (`NULL`) -> ko'rinmaydi (SHOP_ADMIN
--     platforma auditini ko'rmasligi kerak — u superadmin.ko'rish emas)
--   - Kontekst YO'Q (platforma yo'li) + qator `NULL` -> ko'rinadi (platforma
--     auditi platformaga)
--   - Kontekst YO'Q + qator biror Shop'niki           -> ko'rinmaydi (platforma
--     hech qanday Shop ma'lumotini ko'rmaydi — §25.20 invarianti)
-- Xuddi shu ifoda `WITH CHECK`da: platforma yo'lida yozilgan qator `shop_id`
-- NULL bo'lishi SHART, shop-scoped yo'lda yozilgan qator kontekst Shop'iga
-- teng bo'lishi SHART — boshqa Shop nomidan yoki noto'g'ri NULL bilan
-- yozib bo'lmaydi.
CREATE POLICY "audit_logs_tenant_isolation" ON "audit_logs" FOR ALL
  USING ("shop_id" IS NOT DISTINCT FROM NULLIF(current_setting('app.current_shop_id', true), '')::uuid)
  WITH CHECK ("shop_id" IS NOT DISTINCT FROM NULLIF(current_setting('app.current_shop_id', true), '')::uuid);

-- ═══════════════════════ 4-QISM — DB rollari (§21.16, PERMISSIONS.md §4) ═══════════════════════
--
-- `CREATE ROLE` da `IF NOT EXISTS` yo'q (Postgres bunday sintaksisni
-- qo'llab-quvvatlamaydi) — shuning uchun `pg_roles` orqali tekshiriladi,
-- migratsiya boshqa environment'da qayta ishlaganda (masalan CI, yangi dev
-- baza) xato bermasligi uchun.
--
-- Ikkala rol ham `LOGIN` huquqi bilan, lekin PAROLSIZ yaratiladi: parol
-- qo'yilmaguncha ular orqali autentifikatsiya MUVAFFAQIYATSIZ bo'ladi — bu
-- xavfsiz standart holat. Operator keyinroq `ALTER ROLE ... WITH PASSWORD`
-- bilan parol qo'yadi (hisobotda tavsiflangan, `.env`ga kirmaydi).
--
-- `NOSUPERUSER` va jadval egasi bo'lmaslik (5-qism) ataylab: ikkalasi ham
-- RLS'ni chetlab o'tadi (§21.16) — `hisobai_app` uchun bu qabul qilinmaydi,
-- RLS'ning butun maqsadi shu rol ostida ishlashi.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hisobai_app') THEN
        CREATE ROLE hisobai_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT -1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hisobai_migrate') THEN
        CREATE ROLE hisobai_migrate WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT -1;
    END IF;
END $$;

-- ═══════════════════════ 5-QISM — Jadval/funksiya egaligini ko'chirish ═══════════════════════
--
-- Hozir HAMMASI `postgres` superuser'ga tegishli. `hisobai_migrate` DDL
-- (yangi ustun, indeks, jadval) huquqiga ega bo'lishi uchun yo egasi
-- bo'lishi, yo aniq GRANT olishi kerak — egalik tanlandi, chunki u
-- deploy'dagi haqiqiy vaziyatni aks ettiradi ("migratsiya rolini boshqaradi,
-- ilova roli faqat foydalanadi"). `FORCE ROW LEVEL SECURITY` (2-qism)
-- `hisobai_migrate`ni ham RLS'ga bo'ysundiradi — bu ataylab, DDL rolining
-- tasodifan DML yozishidan saqlaydi.
DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        '_prisma_migrations', 'platform_admins', 'platform_sessions', 'shops',
        'cbu_rates', 'shop_exchange_rates', 'users', 'sessions', 'login_attempts',
        'password_reset_tokens', 'idempotency_keys', 'categories', 'brands',
        'products', 'inventory_items', 'inventory_batches', 'stock_movements',
        'stocktakes', 'stocktake_lines', 'customers', 'sales', 'sale_counters',
        'sale_items', 'installment_contracts', 'payment_schedules', 'payments',
        'payment_allocations', 'cash_accounts', 'cash_categories', 'cash_entries',
        'cash_exchanges', 'files', 'documents', 'notification_logs',
        'push_subscriptions', 'audit_logs'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE %I OWNER TO hisobai_migrate', tbl);
    END LOOP;
END $$;

ALTER FUNCTION check_inventory_identifier_unique() OWNER TO hisobai_migrate;
ALTER FUNCTION check_cash_entry_currency() OWNER TO hisobai_migrate;
ALTER FUNCTION check_cost_currency() OWNER TO hisobai_migrate;
ALTER FUNCTION check_exchange_accounts() OWNER TO hisobai_migrate;
ALTER FUNCTION check_contract_currency() OWNER TO hisobai_migrate;

-- ═══════════════════════ 6-QISM — Sxema/baza darajasidagi ruxsatlar ═══════════════════════
--
-- `current_database()` orqali dinamik — bu migratsiya boshqa nomdagi
-- environment'da (CI, boshqa dev baza) ham xatosiz ishlashi uchun.
DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO hisobai_app', current_database());
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO hisobai_migrate', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO hisobai_app;
GRANT USAGE, CREATE ON SCHEMA public TO hisobai_migrate;

-- Kelajakda `hisobai_migrate` yaratadigan jadvallar avtomatik shu ruxsatlarni
-- olishi uchun (aks holda keyingi migratsiya `hisobai_app` o'qiy olmaydigan
-- jadval yaratib qo'yardi — vazifa tavsifidagi ogohlantirish shu yerda
-- bajariladi). `audit_logs` kabi maxsus cheklov bu yerda YO'Q — u faqat
-- ANIQ jadval uchun (8-qism) qo'lda takrorlanadi, chunki DEFAULT PRIVILEGES
-- jadval nomiga qarab farqlay olmaydi.
ALTER DEFAULT PRIVILEGES FOR ROLE hisobai_migrate IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hisobai_app;
ALTER DEFAULT PRIVILEGES FOR ROLE hisobai_migrate IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO hisobai_app;

-- ═══════════════════════ 7-QISM — Jadval darajasidagi ruxsatlar (`hisobai_app`) ═══════════════════════
--
-- Barcha 35 ta ilova jadvali (`_prisma_migrations` BUNDAN MUSTASNO —
-- ilova migratsiya tarixini o'qimaydi ham, yozmaydi ham, faqat
-- `hisobai_migrate` deploy vaqtida). To'liq CRUD — RLS chegarani allaqachon
-- qatorlar darajasida qo'yadi, jadval darajasidagi ruxsat esa faqat "bu
-- rol umuman shu jadvalga tegishi mumkinmi" degan savolga javob beradi.
DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'platform_admins', 'platform_sessions', 'shops', 'cbu_rates',
        'shop_exchange_rates', 'users', 'sessions', 'login_attempts',
        'password_reset_tokens', 'idempotency_keys', 'categories', 'brands',
        'products', 'inventory_items', 'inventory_batches', 'stock_movements',
        'stocktakes', 'stocktake_lines', 'customers', 'sales', 'sale_counters',
        'sale_items', 'installment_contracts', 'payment_schedules', 'payments',
        'payment_allocations', 'cash_accounts', 'cash_categories', 'cash_entries',
        'cash_exchanges', 'files', 'documents', 'notification_logs',
        'push_subscriptions', 'audit_logs'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO hisobai_app', tbl);
    END LOOP;
END $$;

-- ═══════════════════════ 8-QISM — `audit_logs`: faqat INSERT + SELECT ═══════════════════════
--
-- ARCHITECTURE §12 "o'zgarmas audit yozuvlari" deb e'lon qiladi;
-- PERMISSIONS.md §4 buni DB darajasida talab qiladi. 7-qismda hamma
-- jadvalga (shu jumladan `audit_logs`ga) to'liq CRUD berilgan edi — bu
-- yerda faqat shu ikkitasidan UPDATE va DELETE qaytarib olinadi. Endi
-- `hisobai_app` ostida `UPDATE audit_logs ...` va `DELETE FROM audit_logs
-- ...` DB xatosi bilan RAD ETILADI — kod xatosi yoki hatto vzlom qilingan
-- ilova ham audit tarixini o'chira/o'zgartira olmaydi.
REVOKE UPDATE, DELETE ON "audit_logs" FROM hisobai_app;
