-- §5.3 — "IMEI-1 va IMEI-2 ... ikkalasi ham takrorlanmaydi".
--
-- MUAMMO. `imei_1`, `imei_2` va `serial_number` ustunlarida alohida UNIQUE
-- indekslar bor, lekin ular faqat O'Z ustuni ichida ishlaydi. Ya'ni:
--
--   A qatori: imei_1 = '353917104876543'
--   B qatori: imei_2 = '353917104876543'   ← hozir RUXSAT ETILADI
--
-- Bu §5.3 niyatiga zid: bitta jismoniy telefon bazada ikki marta paydo
-- bo'lishi mumkin va uni faqat qidiruv paytida sezish mumkin.
--
-- YECHIM. Trigger uchala ustunni BARCHA qatorlarning uchala ustuni bilan
-- solishtiradi.
--
-- NEGA ADVISORY LOCK. Oddiy "SELECT keyin INSERT" — TOCTOU poygasi:
-- READ COMMITTED da ikkita parallel tranzaksiya bir-birining hali
-- commit qilinmagan qatorini KO'RMAYDI va ikkalasi ham o'tib ketadi
-- (§17.5 da aynan shu naqsh rad etilgan). `pg_advisory_xact_lock`
-- bir xil IMEI qiymati uchun tranzaksiyalarni ketma-ketlashtiradi:
-- ikkinchisi birinchisi commit bo'lgunicha kutadi va keyin uni ko'radi.
-- Qulf qiymat bo'yicha olinadi, jadval bo'yicha emas — turli IMEI'lar
-- bir-birini kutmaydi, qabul qilish tezligi tushmaydi.
--
-- Ustunlardagi mavjud UNIQUE indekslar QOLADI: ular bir xil ustundagi
-- takrorni indeks darajasida, triggersiz to'sadi va qidiruvni tezlashtiradi.

CREATE OR REPLACE FUNCTION check_inventory_identifier_unique() RETURNS TRIGGER AS $$
DECLARE
  identifier text;
  existing_id uuid;
BEGIN
  FOREACH identifier IN ARRAY ARRAY[NEW.imei_1, NEW.imei_2, NEW.serial_number] LOOP
    CONTINUE WHEN identifier IS NULL;

    PERFORM pg_advisory_xact_lock(hashtext(identifier));

    SELECT id INTO existing_id
      FROM "inventory_items"
     WHERE id <> NEW.id
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

DROP TRIGGER IF EXISTS inventory_items_identifier_guard ON "inventory_items";
CREATE TRIGGER inventory_items_identifier_guard
  BEFORE INSERT OR UPDATE OF imei_1, imei_2, serial_number ON "inventory_items"
  FOR EACH ROW EXECUTE FUNCTION check_inventory_identifier_unique();
