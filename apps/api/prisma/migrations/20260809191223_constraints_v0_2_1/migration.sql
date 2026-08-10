-- Ma'lumot yaxlitligi cheklovlari (§17.8)
--
-- Prisma schema tilida ifodalab bo'lmaydigan qoidalar: CHECK, trigger va
-- qisman unique index. Ular schema izohlaridagi "kod darajasida tekshiriladi"
-- degan va'dani haqiqiy kafolatga aylantiradi.
--
-- Sabab: loyihaning butun falsafasi moliyaviy yaxlitlikka qurilgan
-- (ARCHITECTURE §6). Bitta xato kod, bitta qo'lda SQL yoki kelajakdagi
-- migratsiya bazani jimgina buzuq holatga o'tkazishi mumkin. CHECK — oxirgi
-- himoya qatlami.

-- ═══════════════════ 1. Pul har doim musbat ═══════════════════

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
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_cost_non_negative"
  CHECK ("cost_snapshot" >= 0);

ALTER TABLE "sales" ADD CONSTRAINT "sales_rate_positive"
  CHECK ("exchange_rate" > 0);

ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_store_rate_positive"
  CHECK ("store_rate" > 0);
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_cbu_rate_positive"
  CHECK ("cbu_rate" IS NULL OR "cbu_rate" > 0);

ALTER TABLE "cash_exchanges" ADD CONSTRAINT "cash_exchanges_amounts_positive"
  CHECK ("from_amount" > 0 AND "to_amount" > 0 AND "rate" > 0);

-- ═══════════════════ 2. Ombor qoldig'i manfiy bo'lmaydi (§17.5) ═══════════════════

ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_remaining_range"
  CHECK ("quantity_remaining" >= 0 AND "quantity_remaining" <= "quantity_received");
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_received_positive"
  CHECK ("quantity_received" > 0);
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_cost_positive"
  CHECK ("unit_cost" > 0);

ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_cost_positive"
  CHECK ("cost_price" > 0);

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_positive"
  CHECK ("quantity" > 0);

-- ═══════════════════ 3. Qaytarish ikki marta bo'lmaydi (§8.4, §17.4) ═══════════════════

ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_returned_range"
  CHECK ("returned_quantity" >= 0 AND "returned_quantity" <= "quantity");

-- ═══════════════════ 4. To'lov qayerdadir turishi shart (§7.2) ═══════════════════
-- Ilgari ikkala FK ham NULL bo'lgan "yetim" to'lov kiritish mumkin edi.

ALTER TABLE "payments" ADD CONSTRAINT "payments_target_required"
  CHECK ("sale_id" IS NOT NULL OR "contract_id" IS NOT NULL);

-- ═══════════════════ 5. To'lov jadvali (§10.2 — ortiqcha to'lov yo'q) ═══════════════════

ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_amounts"
  CHECK ("amount_due" > 0 AND "amount_paid" >= 0 AND "amount_paid" <= "amount_due");
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_sequence_positive"
  CHECK ("sequence" > 0);

ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_amount_positive"
  CHECK ("amount" > 0);

-- ═══════════════════ 6. Nasiya formulasi (§9.3, §17.3) ═══════════════════

ALTER TABLE "installment_contracts" ADD CONSTRAINT "contracts_principal_formula"
  CHECK ("principal" = "cash_price" + "markup_amount" - "down_payment");
ALTER TABLE "installment_contracts" ADD CONSTRAINT "contracts_amounts_valid"
  CHECK ("cash_price" > 0
     AND "markup_amount" >= 0
     AND "down_payment" >= 0
     AND "principal" >= 0
     AND "down_payment" <= "cash_price" + "markup_amount");

-- ═══════════════════ 7. Holat izchilligi ═══════════════════

-- Tasdiqlangan savdoda raqam ham, vaqt ham bo'lishi shart (§17.1)
ALTER TABLE "sales" ADD CONSTRAINT "sales_confirmed_has_data"
  CHECK ("status" = 'DRAFT'
      OR ("confirmed_at" IS NOT NULL AND "number" IS NOT NULL));

-- Teskari yozuvning shakli to'liq bo'lsin (§8.6, §17.4)
ALTER TABLE "sales" ADD CONSTRAINT "sales_reversal_shape"
  CHECK (("reverses_sale_id" IS NULL AND "reversal_kind" IS NULL AND "reversal_reason" IS NULL)
      OR ("reverses_sale_id" IS NOT NULL AND "reversal_kind" IS NOT NULL AND "reversal_reason" IS NOT NULL));

ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_has_time"
  CHECK ("status" <> 'CONFIRMED' OR "confirmed_at" IS NOT NULL);
ALTER TABLE "payments" ADD CONSTRAINT "payments_rejected_has_reason"
  CHECK ("status" <> 'REJECTED' OR "rejected_reason" IS NOT NULL);

ALTER TABLE "installment_contracts" ADD CONSTRAINT "contracts_closed_has_time"
  CHECK ("status" = 'ACTIVE' OR "closed_at" IS NOT NULL);

ALTER TABLE "stocktakes" ADD CONSTRAINT "stocktakes_completed_has_time"
  CHECK ("status" <> 'COMPLETED' OR "completed_at" IS NOT NULL);

-- §6.9 — "ehtiyot bo'ling" belgisi sababsiz qo'yilmaydi
ALTER TABLE "customers" ADD CONSTRAINT "customers_flag_has_reason"
  CHECK ("is_flagged" = false OR "flag_reason" IS NOT NULL);

-- ═══════════════════ 8. Seriyali birlik identifikatorsiz bo'lmaydi (§5.1, §5.3) ═══════════════════

ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_has_identifier"
  CHECK ("imei_1" IS NOT NULL OR "serial_number" IS NOT NULL);
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_imei_distinct"
  CHECK ("imei_2" IS NULL OR "imei_2" <> "imei_1");

-- ═══════════════════ 9. Sozlamalar oralig'i (§3.7–3.9, §16.2) ═══════════════════

ALTER TABLE "settings" ADD CONSTRAINT "settings_weekend_days_valid"
  CHECK ("weekend_days" <@ ARRAY[0,1,2,3,4,5,6]);
ALTER TABLE "settings" ADD CONSTRAINT "settings_ranges_valid"
  CHECK ("default_down_payment_percent" BETWEEN 0 AND 100
     AND "store_rate_markup_percent"    BETWEEN 0 AND 100
     AND "reminder_hour"                BETWEEN 0 AND 23
     AND "default_installment_months"   > 0
     AND "low_stock_threshold"          >= 0);

-- ═══════════════════ 10. §11.4 — boshlang'ich qoldiq hisob uchun bir marta ═══════════════════

CREATE UNIQUE INDEX "cash_entries_one_opening_balance_per_account"
  ON "cash_entries"("account_id")
  WHERE "source_type" = 'OPENING_BALANCE';

-- ═══════════════════ 11. Sotuvga tayyor qoldiq uchun qisman indeks ═══════════════════

CREATE INDEX "inventory_items_available_idx"
  ON "inventory_items"("product_id")
  WHERE "status" = 'AVAILABLE';

-- ═══════════════════ 12. Matn qidiruvi (audit §5.3) ═══════════════════
-- Hozirgi btree indekslar `%...%` qidiruvida ishlatilmaydi.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "products_display_name_trgm_idx"
  ON "products" USING GIN ("display_name" gin_trgm_ops);
CREATE INDEX "customers_full_name_trgm_idx"
  ON "customers" USING GIN ("full_name" gin_trgm_ops);

-- ═══════════════════ 13. Jadvallararo valyuta mosligi ═══════════════════
-- CHECK bilan ifodalab bo'lmaydi (boshqa jadvalga murojaat qiladi) → trigger.
-- Kod darajasidagi tekshiruv bundan ozod qilmaydi — bu ikkinchi qatlam.

-- §11.1 — kassa yozuvi valyutasi hisob valyutasiga teng
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

-- §1.2, §16.9 — tannarx valyutasi mahsulot valyutasiga teng
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

-- §11.6 — ayirboshlash ikki xil valyutali ikki hisob orasida bo'ladi
CREATE OR REPLACE FUNCTION check_exchange_accounts() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.from_account_id = NEW.to_account_id THEN
    RAISE EXCEPTION 'Ayirboshlash bir hisob ichida bo''lmaydi (§11.6)';
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

-- §9.2 — shartnoma valyutasi savdo valyutasiga teng va o'zgarmaydi
CREATE OR REPLACE FUNCTION check_contract_currency() RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT currency FROM sales WHERE id = NEW.sale_id) <> NEW.currency THEN
    RAISE EXCEPTION 'installment_contracts.currency savdo valyutasiga mos emas (§9.2)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER installment_contracts_currency_guard
  BEFORE INSERT OR UPDATE ON "installment_contracts"
  FOR EACH ROW EXECUTE FUNCTION check_contract_currency();
