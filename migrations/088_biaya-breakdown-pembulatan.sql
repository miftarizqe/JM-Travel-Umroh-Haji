-- "Bulatkan Harga Jual" sebelum ini cuma state lokal komponen (useState),
-- gak pernah kesimpen ke template — jadi tiap buka ulang template, settingan
-- pembulatan reset ke 0 (gak dibulatkan) dan Harga Jual keliatan kayak
-- "balik ke HPP". Kolom ini nyimpen pilihan itu permanen per template.
ALTER TABLE biaya_breakdown
  ADD COLUMN pembulatan INT NOT NULL DEFAULT 0 AFTER bintang_aktif;
