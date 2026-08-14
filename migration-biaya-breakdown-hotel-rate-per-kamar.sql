-- Hotel Mekkah/Madinah ternyata dikuotasi 3 rate TERPISAH per tipe kamar
-- (Double/Triple/Quad, gak selalu kelipatan rapi) — diverifikasi ulang dari
-- formula asli Excel (blok "Quad"/"Triple"/"Double" masing2 pakai kolom
-- rate sendiri, BUKAN 1 rate yg dibagi kapasitas kamar).
-- Backfill nyalin rate lama ke ketiganya dulu supaya hasil HPP program yang
-- udah ada TETAP SAMA sampai admin update manual ke angka real per tipe kamar.
ALTER TABLE biaya_breakdown
  ADD COLUMN hotel_mekkah_rate_double DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER hotel_mekkah_rate,
  ADD COLUMN hotel_mekkah_rate_triple DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER hotel_mekkah_rate_double,
  ADD COLUMN hotel_mekkah_rate_quad DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER hotel_mekkah_rate_triple,
  ADD COLUMN hotel_madinah_rate_double DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER hotel_madinah_rate,
  ADD COLUMN hotel_madinah_rate_triple DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER hotel_madinah_rate_double,
  ADD COLUMN hotel_madinah_rate_quad DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER hotel_madinah_rate_triple;

UPDATE biaya_breakdown SET
  hotel_mekkah_rate_double = hotel_mekkah_rate, hotel_mekkah_rate_triple = hotel_mekkah_rate, hotel_mekkah_rate_quad = hotel_mekkah_rate,
  hotel_madinah_rate_double = hotel_madinah_rate, hotel_madinah_rate_triple = hotel_madinah_rate, hotel_madinah_rate_quad = hotel_madinah_rate;

ALTER TABLE biaya_breakdown
  DROP COLUMN hotel_mekkah_rate,
  DROP COLUMN hotel_madinah_rate;
