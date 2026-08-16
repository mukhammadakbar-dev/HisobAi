-- §11.8 + §17.5 — bitta kassa yozuvi ko'pi bilan BIR marta teskari qilinadi.
--
-- Servis qatlamida tekshiruv bor, lekin u "avval SELECT, keyin INSERT":
-- §17.5 aynan shu naqshni kafolat sifatida rad etadi. Ikki marta teskari
-- yozuv kassani asl xatodan ikki barobar ko'p "tuzatib" qo'yardi, ya'ni
-- jimgina moliyaviy nomuvofiqlik hosil qilardi.
--
-- PostgreSQL'da unique indeks bir nechta `NULL` ga ruxsat beradi, shuning
-- uchun teskari yozuv BO'LMAGAN qatorlar (aksariyati) cheklovga umuman
-- tushmaydi. `cash_entries.attachment_file_id` da xuddi shu naqsh.
CREATE UNIQUE INDEX "cash_entries_reverses_entry_id_key"
  ON "cash_entries"("reverses_entry_id");
