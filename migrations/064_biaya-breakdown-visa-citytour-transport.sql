-- Welcome Drink Zamzam dihapus — kalo Handling Jeddah gak dipakai, zamzam
-- otomatis kepake lewat jalur lain, jadi field terpisah ini gak perlu.
ALTER TABLE biaya_breakdown
  DROP COLUMN welcome_drink_zamzam,
  ADD COLUMN visa_rate DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER tiket_pesawat_rate,
  ADD COLUMN city_tour_mekkah TINYINT NOT NULL DEFAULT 0 AFTER handling_jeddah,
  ADD COLUMN city_tour_madinah TINYINT NOT NULL DEFAULT 0 AFTER city_tour_mekkah,
  ADD COLUMN city_tour_thaif TINYINT NOT NULL DEFAULT 0 AFTER city_tour_madinah,
  ADD COLUMN transportasi_pilihan ENUM('bus','hiace','mobil') NULL AFTER city_tour_thaif;

-- Visa sekarang field tersendiri (nominal sama utk seluruh program, kayak
-- Tiket Pesawat) — bukan lagi dipilih dari Master item, biar gak dobel.
DELETE FROM biaya_master_item WHERE kelompok = 'Cost Tour Leader' AND nama = 'Visa';
