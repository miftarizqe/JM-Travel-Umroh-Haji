-- Kalkulator biaya v2 — selaras ke Master Sheet Costing asli (multi-currency
-- + daftar harga acuan yang bisa dipilih ulang), gantikan skema Fase 1 yang
-- masih terlalu sederhana (belum ada data nyata sama sekali, aman di-drop).
DROP TABLE IF EXISTS biaya_breakdown_item;
DROP TABLE IF EXISTS biaya_breakdown;

-- Daftar harga ACUAN (versi digital tab "Master" di Excel costing) —
-- kelompok bebas isi (bukan enum kaku) biar admin bisa nambah kelompok baru
-- sendiri tanpa migration lagi.
CREATE TABLE biaya_master_item (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kelompok VARCHAR(100) NOT NULL,
  nama VARCHAR(150) NOT NULL,
  keterangan VARCHAR(255),
  harga_default DECIMAL(14,2) NOT NULL DEFAULT 0,
  mata_uang ENUM('SAR','USD','IDR') NOT NULL DEFAULT 'IDR',
  urutan INT NOT NULL DEFAULT 0,
  aktif TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE biaya_breakdown (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(150) NOT NULL,
  is_template TINYINT NOT NULL DEFAULT 0,
  program_id VARCHAR(36) NULL,
  paket ENUM('deluxe','eksekutif','signature') NULL,
  kurs_usd_idr DECIMAL(14,2) NOT NULL DEFAULT 0,
  kurs_sar_idr DECIMAL(14,2) NOT NULL DEFAULT 0,
  hotel_mekkah_nama VARCHAR(150),
  hotel_mekkah_rate DECIMAL(14,2) NOT NULL DEFAULT 0,
  hotel_mekkah_malam INT NOT NULL DEFAULT 0,
  hotel_mekkah_mata_uang ENUM('SAR','USD','IDR') NOT NULL DEFAULT 'SAR',
  hotel_madinah_nama VARCHAR(150),
  hotel_madinah_rate DECIMAL(14,2) NOT NULL DEFAULT 0,
  hotel_madinah_malam INT NOT NULL DEFAULT 0,
  hotel_madinah_mata_uang ENUM('SAR','USD','IDR') NOT NULL DEFAULT 'SAR',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (program_id),
  FOREIGN KEY (program_id) REFERENCES programs(id)
);

CREATE TABLE biaya_breakdown_item (
  id INT AUTO_INCREMENT PRIMARY KEY,
  breakdown_id INT NOT NULL,
  master_item_id INT NULL,
  kelompok VARCHAR(100) NOT NULL,
  nama VARCHAR(150) NOT NULL,
  nominal DECIMAL(14,2) NOT NULL DEFAULT 0,
  mata_uang ENUM('SAR','USD','IDR') NOT NULL DEFAULT 'IDR',
  urutan INT NOT NULL DEFAULT 0,
  FOREIGN KEY (breakdown_id) REFERENCES biaya_breakdown(id) ON DELETE CASCADE,
  FOREIGN KEY (master_item_id) REFERENCES biaya_master_item(id)
);
