-- Modul Negara Tambahan — tabel generik buat tarif per-bracket pax (Dubai
-- MED Alliance/Arrayan, Turkey 3 rute, dan negara lain nanti). Satu tabel
-- tier dipakai bareng-bareng semua varian — beda cuma isi datanya + flag
-- dimensi mana yang aktif (pakai_periode/hotel_star/city_tour_opsi).
CREATE TABLE modul_negara (
  id INT AUTO_INCREMENT PRIMARY KEY,
  jenis_program VARCHAR(40) NOT NULL,
  kode VARCHAR(60) NOT NULL UNIQUE,
  nama VARCHAR(150) NOT NULL,
  mata_uang ENUM('SAR','USD','IDR') NOT NULL DEFAULT 'USD',
  pakai_periode TINYINT NOT NULL DEFAULT 0,
  pakai_hotel_star TINYINT NOT NULL DEFAULT 0,
  pakai_city_tour_opsi TINYINT NOT NULL DEFAULT 0,
  urutan INT NOT NULL DEFAULT 0,
  aktif TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- hari = kunci pemilihan tabel tier (bukan pengali); pax_min/pax_max
-- inklusif dua-duanya, pax_max NULL = open-ended ("40+").
CREATE TABLE modul_negara_tier (
  id INT AUTO_INCREMENT PRIMARY KEY,
  modul_negara_id INT NOT NULL,
  periode VARCHAR(20) NULL,
  hotel_star TINYINT NULL,
  city_tour_opsi TINYINT NULL,
  hari INT NOT NULL,
  pax_min INT NOT NULL,
  pax_max INT NULL,
  harga_per_pax DECIMAL(14,2) NOT NULL,
  urutan INT NOT NULL DEFAULT 0,
  FOREIGN KEY (modul_negara_id) REFERENCES modul_negara(id) ON DELETE CASCADE
);

ALTER TABLE biaya_master_item ADD COLUMN modul_negara_id INT NULL AFTER trigger_kunci,
  ADD FOREIGN KEY (modul_negara_id) REFERENCES modul_negara(id);
ALTER TABLE biaya_breakdown_item ADD COLUMN modul_negara_id INT NULL AFTER trigger_kunci,
  ADD FOREIGN KEY (modul_negara_id) REFERENCES modul_negara(id);
