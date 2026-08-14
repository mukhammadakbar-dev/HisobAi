-- FK ustunlarida yetishmayotgan indekslar (ma'lumotlar bazasi auditi, MEDIUM).
--
-- PostgreSQL chet kalit ustiga avtomatik indeks QO'YMAYDI (MySQL'dan farqli
-- o'laroq). `Category` va `CashCategory` ikkalasi ham `onDelete: Restrict`
-- bilan bog'langan — indekssiz har bir o'chirish urinishi bola jadval
-- bo'ylab to'liq skan qilishga majbur qiladi. Xuddi shu indeks kategoriya
-- bo'yicha filtrlash/hisobotlarga ham xizmat qiladi.
--
-- Yetakchi ustun `shop_id` — qolgan barcha indekslar bilan bir xil naqsh
-- (§21): har so'rov allaqachon tenant bo'yicha chegaralangan.
--
-- `CONCURRENTLY` ATAYLAB ISHLATILMAGAN: u tranzaksiya ichida ishlamaydi,
-- Prisma esa har bir migratsiyani bitta tranzaksiyada bajaradi. Jadvallar
-- hozircha kichik; katta ma'lumotli bazada bu indekslar alohida,
-- migratsiyadan tashqarida qo'yilishi kerak.

CREATE INDEX "products_shop_id_category_id_idx" ON "products"("shop_id", "category_id");

CREATE INDEX "cash_entries_shop_id_category_id_idx" ON "cash_entries"("shop_id", "category_id");
