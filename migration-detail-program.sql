-- ============================================================
-- MIGRATION: Detail Program (include / exclude / itinerary / tanggal_berangkat)
-- Jalankan sekali:
--   mysql -u root -pJMTravel123! jm_travel < migration-detail-program.sql
-- ============================================================

-- 1) Tanggal berangkat yang bisa dihitung mesin (untuk auto-generate tanggal itinerary)
--    Kolom `tanggal` lama TETAP dipakai untuk teks tampilan bebas ("15-23 Maret 2026")
ALTER TABLE programs
  ADD COLUMN tanggal_berangkat DATE NULL AFTER tanggal;

-- 2) Include / Exclude
--    Disimpan sebagai TEXT, 1 baris = 1 item (dipisah newline)
ALTER TABLE programs
  ADD COLUMN include_items TEXT NULL AFTER highlight,
  ADD COLUMN exclude_items TEXT NULL AFTER include_items;

-- 3) Itinerary
--    Disimpan sebagai JSON: array of string, index 0 = Hari 1, dst.
--    Contoh: ["Kumpul bandara Soetta","Tiba Madinah, check-in", ...]
ALTER TABLE programs
  ADD COLUMN itinerary JSON NULL AFTER exclude_items;
