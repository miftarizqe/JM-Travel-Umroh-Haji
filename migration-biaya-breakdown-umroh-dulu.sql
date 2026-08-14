-- "Umroh dulu" (urutan itinerary gabungan Umroh+Modul Negara) sebelum ini
-- CUMA ada di state React (shared.umroh_dulu), gak pernah kesimpen ke DB
-- sama sekali — jadi tiap buka ulang template, balik ke default true
-- (Umroh dulu) walau udah diuncontreng sebelum disimpan.
ALTER TABLE biaya_breakdown
  ADD COLUMN umroh_dulu TINYINT NOT NULL DEFAULT 1 AFTER pembulatan;
