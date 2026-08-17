-- ═══════════════════════════════════════════════════════════════════════════
-- `shops.logo_file_id` uchun tenant qo'riqchisi (§21, §18.3 namunasi)
--
-- MUAMMO. `20260817120000_files_composite_tenant_fk` beshta fayl havolasini
-- kompozit FK bilan yopdi, lekin `shops.logo_file_id` ni yopa olmadi.
-- To'g'ri kalit `(logo_file_id, id) -> files(id, shop_id)` bo'lardi — `shops`
-- tenantning O'ZI, shuning uchun ikkinchi ustun `shops.id`. SQL darajasida bu
-- ishlaydi, ammo Prisma'da `shops.id` relation-skalyariga aylanadi: Prisma
-- bunday maydonni `create` kirish tipidan olib tashlaydi, `@default(uuid())`
-- qo'llanmaydi va HAR QANDAY `shop.create()` `id = NULL` bilan yiqiladi
-- (izolyatsiya to'plamida amalda kuzatilgan). FK'ni faqat SQL'da qoldirish ham
-- yaramaydi — Prisma FK'ni KO'RADI va keyingi `migrate diff` uni DROP qiladi.
--
-- YECHIM. Trigger. Triggerlarni Prisma umuman ko'rmaydi (§18.3, §18.5 shu
-- sababdan qo'lda yozilgan), ya'ni drift yo'q, `schema.prisma` o'zgarmaydi.
--
-- NEGA `SECURITY DEFINER` EMAS (ataylab qabul qilingan qaror):
--   1. `files` ustida RLS `ENABLE` + `FORCE`. `FORCE` — jadval EGASIGA ham
--      qo'llanadi, ega esa `hisobai_migrate`. Ya'ni funksiyani `SECURITY
--      DEFINER` qilib egasiga bog'lash RLS ni CHETLAB O'TMAYDI — u hech narsa
--      bermaydi, faqat imtiyoz oshirish yuzasini qo'shadi.
--   2. Haqiqiy chetlab o'tish uchun `BYPASSRLS` rolli definer kerak bo'lardi.
--      Bu esa "istalgan tenantning `files` ini o'qiy oladigan funksiya"
--      demakdir — aynan biz to'sayotgan teshikning o'zi. `PERMISSIONS.md` §4
--      da bunday rol yo'q va uni bu migratsiya o'ylab topmaydi.
--   3. `SECURITY INVOKER` (standart) semantikasi bu yerda FAIL-CLOSED: RLS
--      faqat qatorni YASHIRA oladi, ko'rsata olmaydi. Yashiringan qator =>
--      tekshiruv yiqiladi => havola rad etiladi. Ya'ni cross-tenant havola
--      hech qachon o'tib keta olmaydi; eng yomoni — haqiqiy havola ham rad
--      etilishi (quyidagi cheklovga qarang).
--
-- CHEKLOV (ochiq yoziladi). `hisobai_app` ostida logotip o'rnatish uchun
-- `app.current_shop_id` AYNAN o'sha Shop'ga teng bo'lishi shart — bu tenant
-- shartnomasining o'zi. Shop kontekstisiz (Platform/SUPERADMIN yo'li) logotip
-- o'rnatish rad etiladi. Seed va migratsiyalar superuser ostida ishlaydi,
-- superuser RLS ni chetlab o'tadi, shuning uchun ular ta'sirlanmaydi.
--
-- MAVJUD QATORLAR. Trigger faqat INSERT/UPDATE da ishlaydi, mavjud qatorlarni
-- tekshirmaydi — migratsiya forward-safe, backfill kerak emas. Bu yerda
-- oldingi migratsiyadagidek diagnostik SELECT ATAYLAB YO'Q: u yerda ikkala
-- jadval ham RLS ostida edi (natija 0), bu yerda esa `shops` da RLS YO'Q,
-- `files` da BOR — migratsiya roli ostida logotipi bor HAR BIR Shop soxta
-- "buzuq" bo'lib ko'rinardi va migratsiya bekorga yiqilardi.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION check_shop_logo_tenant() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.logo_file_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "files" f
     WHERE f.id = NEW.logo_file_id
       AND f.shop_id = NEW.id
  ) THEN
    -- 23503 = foreign_key_violation. Xabar, DETAIL va `CONSTRAINT` nomi
    -- PostgreSQL ning haqiqiy FK xatosi bilan bir xil shaklda beriladi
    -- (`customers_passport_file_id_shop_id_fkey` kabi), shuning uchun Prisma
    -- uni P2003 ga aylantiradi va ilova cheklov NOMI bo'yicha ajratadi.
    -- Nom — Prisma haqiqiy kompozit FK ga qo'ygan bo'lardigan nom.
    RAISE EXCEPTION 'insert or update on table "shops" violates foreign key constraint "shops_logo_file_id_id_fkey"'
      USING ERRCODE = '23503',
            DETAIL = format(
              'Key (logo_file_id, id)=(%s, %s) is not present in table "files".',
              NEW.logo_file_id, NEW.id
            ),
            CONSTRAINT = 'shops_logo_file_id_id_fkey',
            TABLE = 'shops',
            SCHEMA = 'public';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shops_logo_tenant_guard ON "shops";
CREATE TRIGGER shops_logo_tenant_guard
  BEFORE INSERT OR UPDATE OF logo_file_id ON "shops"
  FOR EACH ROW EXECUTE FUNCTION check_shop_logo_tenant();

-- §21.16 — boshqa trigger funksiyalari bilan bir xil egalik
-- (`20260813150000` dagi `ALTER FUNCTION ... OWNER TO hisobai_migrate` ro'yxati).
ALTER FUNCTION check_shop_logo_tenant() OWNER TO hisobai_migrate;
