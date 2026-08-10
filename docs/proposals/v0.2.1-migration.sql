-- ═══════════════════════════════════════════════════════════════════════
-- HisobAI CRM — v0.2.1 schema tuzatishlari
--
-- ✅ QO'LLANDI (2026-08-10). Bu fayl endi TARIXIY HUJJAT.
--
-- Haqiqiy migratsiyalar:
--   apps/api/prisma/migrations/20260809191057_v0_2_1_refinements/   (A qismi)
--   apps/api/prisma/migrations/20260809191223_constraints_v0_2_1/   (B, C qismlari)
--
-- Baza `reset` qilinmadi: A qismi `prisma migrate diff` bilan qo'shimcha
-- migratsiya sifatida yaratildi (mavjud seed ma'lumoti saqlandi).
-- D qismi (DB rollari) hali qo'llanmagan — u production deploy bosqichida.
--
-- Manba: DECISIONS.md §16 (14 ta aniqlashtirish) va §17 (18 ta blocker).
-- ═══════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────
-- A QISMI — schema.prisma da qilinadigan o'zgarishlar
--            (quyida ularning SQL ekvivalenti, tushunish uchun)
-- ───────────────────────────────────────────────────────────────────────

-- A1. §17.1 — savdo raqami qoralamada bo'lmaydi
ALTER TABLE "sales" ALTER COLUMN "number" DROP NOT NULL;

-- A2. §17.18 — chegirma yo'q (§7.3), subtotal doim total ga teng edi
ALTER TABLE "sales" DROP COLUMN "subtotal";

-- A3. §17.4 — teskari yozuv uchun alohida holat
ALTER TYPE "SaleStatus" ADD VALUE 'REVERSAL';

-- A4. §17.1 — savdo raqamini poygasiz ajratish
CREATE TABLE "sale_counters" (
  "year"     INTEGER PRIMARY KEY,
  "last_seq" INTEGER NOT NULL DEFAULT 0
);
-- Ishlatilishi (tasdiqlash tranzaksiyasi ichida, qator qulfi bilan):
--   INSERT INTO sale_counters(year) VALUES ($1) ON CONFLICT DO NOTHING;
--   UPDATE sale_counters SET last_seq = last_seq + 1
--    WHERE year = $1 RETURNING last_seq;

-- A5. §17.6 — takroriy so'rovdan himoya
CREATE TABLE "idempotency_keys" (
  "key"           TEXT PRIMARY KEY,
  "user_id"       UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint"      TEXT NOT NULL,
  "request_hash"  TEXT NOT NULL,
  "status_code"   INTEGER,
  "response_body" JSONB,
  "created_at"    TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- A6. §16.2 — ustama foiz bo'ldi
ALTER TABLE "settings" RENAME COLUMN "store_rate_markup" TO "store_rate_markup_percent";
ALTER TABLE "settings" ALTER COLUMN "store_rate_markup_percent" TYPE DECIMAL(5,2);

-- A7. §17.18 — bazaviy valyuta sozlanmaydi, doim UZS (§1.1)
ALTER TABLE "settings" DROP COLUMN "base_currency";

-- A8. §17.2 — kassaga pul faqat to'lov orqali tushadi
ALTER TABLE "cash_entries" DROP COLUMN "sale_id";
-- CashSourceType dan 'SALE' va 'PERSONAL_USE' olib tashlanadi.
-- PostgreSQL enum'dan qiymat olib tashlash uchun tip qayta yaratiladi;
-- baza bo'sh bo'lgani uchun eng sodda yo'l — migratsiyani qayta yaratish.

-- A9. §16.14 — MVP'da bitta rol
-- UserRole enum'i faqat 'OWNER' bilan qoladi (A8 dagi kabi qayta yaratiladi).

-- A10. §17.13 — qayta rejalashtirilgan jadval qatori eslatmasiz qolmasin
ALTER TABLE "notification_logs" ALTER COLUMN "schedule_id" SET NOT NULL;
DROP INDEX "notification_logs_schedule_id_channel_type_key";
CREATE UNIQUE INDEX "notification_logs_schedule_channel_type_scheduled_key"
  ON "notification_logs"("schedule_id", "channel", "type", "scheduled_for");

-- A11. §17.9 — barcha vaqt ustunlari timezone bilan
--      schema.prisma da har DateTime ga @db.Timestamptz(3) qo'shiladi.
--      @db.Date maydonlar (due_date, exchange_rates.date) o'zgarmaydi.
--      Namuna (66 ta ustun uchun takrorlanadi):
-- ALTER TABLE "sales" ALTER COLUMN "sold_at" TYPE TIMESTAMPTZ(3)
--   USING "sold_at" AT TIME ZONE 'UTC';

-- A12. §17.4 — teskari savdoni topish uchun
--      schema.prisma: @@index([reversesSaleId])


-- ───────────────────────────────────────────────────────────────────────
-- B QISMI — CHECK cheklovlari (§17.8)
--            Prisma schema tilida ifodalanmaydi → qo'lda migratsiya
--            Har biri "kod darajasida tekshiriladi" degan izohni
--            haqiqiy kafolatga aylantiradi.
-- ───────────────────────────────────────────────────────────────────────

-- ── Pul har doim musbat ──────────────────────────────────────────────
ALTER TABLE "payments" ADD CONSTRAINT "payments_paid_amount_positive"
  CHECK ("paid_amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_applied_amount_positive"
  CHECK ("applied_amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_rate_positive"
  CHECK ("exchange_rate" > 0);
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_amount_positive"
  CHECK ("amount" > 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_price_non_negative"
  CHECK ("unit_price" >= 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_quantity_positive"
  CHECK ("quantity" > 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_rate_positive"
  CHECK ("exchange_rate" > 0);
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_store_rate_positive"
  CHECK ("store_rate" > 0);
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_cbu_rate_positive"
  CHECK ("cbu_rate" IS NULL OR "cbu_rate" > 0);
ALTER TABLE "cash_exchanges" ADD CONSTRAINT "cash_exchanges_amounts_positive"
  CHECK ("from_amount" > 0 AND "to_amount" > 0 AND "rate" > 0);

-- ── Ombor qoldig'i hech qachon manfiy bo'lmaydi (§17.5) ───────────────
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_remaining_range"
  CHECK ("quantity_remaining" >= 0
     AND "quantity_remaining" <= "quantity_received");
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_received_positive"
  CHECK ("quantity_received" > 0);
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_cost_positive"
  CHECK ("cost_price" > 0);

-- ── Qaytarish ikki marta bo'lmaydi (§8.4, §17.4) ──────────────────────
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_returned_range"
  CHECK ("returned_quantity" >= 0 AND "returned_quantity" <= "quantity");

-- ── To'lov qayerdadir turishi shart (§7.2) ────────────────────────────
--    Hozir ikkala FK ham NULL bo'lgan to'lov kiritish mumkin.
ALTER TABLE "payments" ADD CONSTRAINT "payments_target_required"
  CHECK ("sale_id" IS NOT NULL OR "contract_id" IS NOT NULL);

-- ── To'lov jadvali (§10.2 — ortiqcha to'lov qabul qilinmaydi) ─────────
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_amounts"
  CHECK ("amount_due" > 0
     AND "amount_paid" >= 0
     AND "amount_paid" <= "amount_due");
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_amount_positive"
  CHECK ("amount" > 0);

-- ── Nasiya formulasi (§9.3, §17.3) ───────────────────────────────────
ALTER TABLE "installment_contracts" ADD CONSTRAINT "contracts_principal_formula"
  CHECK ("principal" = "cash_price" + "markup_amount" - "down_payment");
ALTER TABLE "installment_contracts" ADD CONSTRAINT "contracts_amounts_non_negative"
  CHECK ("cash_price" > 0
     AND "markup_amount" >= 0
     AND "down_payment" >= 0
     AND "principal" >= 0);

-- ── Valyuta mosligi ──────────────────────────────────────────────────
-- schema izohi: "Hisob valyutasi bilan bir xil bo'lishi shart".
-- Bu — CHECK bilan ifodalab bo'lmaydigan jadvallararo qoida, shuning
-- uchun trigger. Kod darajasidagi tekshiruv bundan ozod qilmaydi.
CREATE OR REPLACE FUNCTION check_cash_entry_currency() RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT currency FROM cash_accounts WHERE id = NEW.account_id) <> NEW.currency THEN
    RAISE EXCEPTION 'cash_entries.currency hisob valyutasiga mos emas (§11.1)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cash_entries_currency_guard
  BEFORE INSERT OR UPDATE ON "cash_entries"
  FOR EACH ROW EXECUTE FUNCTION check_cash_entry_currency();

-- §16.9 — tannarx valyutasi = mahsulot valyutasi
CREATE OR REPLACE FUNCTION check_cost_currency() RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT currency FROM products WHERE id = NEW.product_id) <> NEW.cost_currency THEN
    RAISE EXCEPTION 'cost_currency mahsulot valyutasiga mos emas (§1.2, §16.9)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_items_cost_currency_guard
  BEFORE INSERT OR UPDATE ON "inventory_items"
  FOR EACH ROW EXECUTE FUNCTION check_cost_currency();

CREATE TRIGGER inventory_batches_cost_currency_guard
  BEFORE INSERT OR UPDATE ON "inventory_batches"
  FOR EACH ROW EXECUTE FUNCTION check_cost_currency();

-- §11.6 — ayirboshlash ikki xil valyuta orasida bo'ladi
CREATE OR REPLACE FUNCTION check_exchange_accounts() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.from_account_id = NEW.to_account_id THEN
    RAISE EXCEPTION 'Ayirboshlash bir hisobning ichida bo''lmaydi (§11.6)';
  END IF;
  IF (SELECT currency FROM cash_accounts WHERE id = NEW.from_account_id)
   = (SELECT currency FROM cash_accounts WHERE id = NEW.to_account_id) THEN
    RAISE EXCEPTION 'Ayirboshlash bir xil valyutalar orasida bo''lmaydi (§11.6)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cash_exchanges_guard
  BEFORE INSERT OR UPDATE ON "cash_exchanges"
  FOR EACH ROW EXECUTE FUNCTION check_exchange_accounts();

-- ── Holat izchilligi ─────────────────────────────────────────────────
ALTER TABLE "sales" ADD CONSTRAINT "sales_confirmed_has_data"
  CHECK ("status" = 'DRAFT'
      OR ("confirmed_at" IS NOT NULL AND "number" IS NOT NULL));
ALTER TABLE "sales" ADD CONSTRAINT "sales_reversal_shape"
  CHECK (("reverses_sale_id" IS NULL     AND "reversal_kind" IS NULL)
      OR ("reverses_sale_id" IS NOT NULL AND "reversal_kind" IS NOT NULL
                                         AND "reversal_reason" IS NOT NULL));
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_has_time"
  CHECK ("status" <> 'CONFIRMED' OR "confirmed_at" IS NOT NULL);
ALTER TABLE "payments" ADD CONSTRAINT "payments_rejected_has_reason"
  CHECK ("status" <> 'REJECTED' OR "rejected_reason" IS NOT NULL);
ALTER TABLE "installment_contracts" ADD CONSTRAINT "contracts_closed_has_time"
  CHECK ("status" = 'ACTIVE' OR "closed_at" IS NOT NULL);

-- ── §11.4 — boshlang'ich qoldiq har hisob uchun bir marta ─────────────
CREATE UNIQUE INDEX "cash_entries_one_opening_balance_per_account"
  ON "cash_entries"("account_id")
  WHERE "source_type" = 'OPENING_BALANCE';

-- ── §3.7 — dam olish kunlari 0..6 oralig'ida ─────────────────────────
ALTER TABLE "settings" ADD CONSTRAINT "settings_weekend_days_valid"
  CHECK ("weekend_days" <@ ARRAY[0,1,2,3,4,5,6]);
ALTER TABLE "settings" ADD CONSTRAINT "settings_percent_ranges"
  CHECK ("default_down_payment_percent" BETWEEN 0 AND 100
     AND "store_rate_markup_percent"    BETWEEN 0 AND 100
     AND "reminder_hour"                BETWEEN 0 AND 23
     AND "default_installment_months"   > 0
     AND "low_stock_threshold"          >= 0);

-- ── §5.1 — seriyali birlik identifikatorsiz bo'lmaydi ────────────────
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_has_identifier"
  CHECK ("imei_1" IS NOT NULL OR "serial_number" IS NOT NULL);
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_imei_distinct"
  CHECK ("imei_2" IS NULL OR "imei_2" <> "imei_1");


-- ───────────────────────────────────────────────────────────────────────
-- C QISMI — yetishmayotgan indekslar (audit §5.3)
-- ───────────────────────────────────────────────────────────────────────

-- "Bu IMEI qaysi savdoda sotilgan?" — asosiy qidiruv
CREATE INDEX "sale_items_inventory_item_id_idx"
  ON "sale_items"("inventory_item_id");

-- Birlik tarixi
CREATE INDEX "stock_movements_inventory_item_id_occurred_at_idx"
  ON "stock_movements"("inventory_item_id", "occurred_at");

-- Qaytarishda teskari kassa yozuvini topish
CREATE INDEX "cash_entries_payment_id_idx" ON "cash_entries"("payment_id");

-- Hisob bo'yicha to'lovlar
CREATE INDEX "payments_cash_account_id_paid_at_idx"
  ON "payments"("cash_account_id", "paid_at");

-- Teskari savdolarni topish (§17.4)
CREATE INDEX "sales_reverses_sale_id_idx" ON "sales"("reverses_sale_id");

-- Sotuvga tayyor qoldiq
CREATE INDEX "inventory_items_available_idx"
  ON "inventory_items"("product_id")
  WHERE "status" = 'AVAILABLE';

-- Matn qidiruvi: hozirgi btree indekslar `%...%` da ishlamaydi
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "products_display_name_trgm_idx"
  ON "products" USING GIN ("display_name" gin_trgm_ops);
CREATE INDEX "customers_full_name_trgm_idx"
  ON "customers" USING GIN ("full_name" gin_trgm_ops);

-- Audit filtri
CREATE INDEX "audit_logs_action_created_at_idx"
  ON "audit_logs"("action", "created_at");


-- ───────────────────────────────────────────────────────────────────────
-- D QISMI — ma'lumotlar bazasi rollari (PERMISSIONS.md §4)
--            "O'zgarmas audit" e'lon emas, kafolat bo'lsin.
-- ───────────────────────────────────────────────────────────────────────

-- CREATE ROLE hisobai_app LOGIN PASSWORD '…';   -- deploy paytida
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hisobai_app;
-- REVOKE UPDATE, DELETE ON "audit_logs"     FROM hisobai_app;
-- REVOKE UPDATE, DELETE ON "stock_movements" FROM hisobai_app;  -- §5.10
-- REVOKE UPDATE, DELETE ON "login_attempts"  FROM hisobai_app;  -- §2.10
-- Migratsiyalar alohida `hisobai_migrate` roli bilan bajariladi.


-- ───────────────────────────────────────────────────────────────────────
-- E QISMI — seed tuzatishi (§17.12)
-- ───────────────────────────────────────────────────────────────────────
-- `prisma/seed.mts` dan `shaxsiy-foydalanish` KASSA kategoriyasi olib
-- tashlanadi: shaxsiy foydalanish kassadan pul chiqarmaydi, u pul
-- bo'lmagan xarajat. Hisobotda `stock_movements(PERSONAL_USE)` dan
-- hisoblanadi.
