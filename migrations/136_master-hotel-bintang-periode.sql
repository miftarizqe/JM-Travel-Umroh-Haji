-- ============================================
-- MIGRATION: Master Hotel — Bintang + banyak Periode per hotel
--
-- Dulu `master_hotel_rate` FLAT (1 baris = 1 hotel + 1 rate + 1 periode) —
-- kalau harga hotel yang SAMA beda per periode, admin kepaksa bikin baris
-- baru & ngetik ulang nama hotelnya. Direstruktur jadi 2 tabel: `master_hotel`
-- (kota + BINTANG 3/4/5 + nama hotel — 1x doang per hotel) dan
-- `master_hotel_periode` (banyak baris rate per periode per hotel), biar
-- nambah periode baru gak perlu bikin ulang hotelnya (dikonfirmasi user
-- 2026-08-18). `master_hotel_rate` LAMA masih kosong (belum pernah diisi
-- data asli) jadi aman di-drop total, gak ada migrasi data.
--
-- Jalankan sekali di MySQL, database: jm_travel
-- ============================================

DROP TABLE IF EXISTS master_hotel_rate;

CREATE TABLE IF NOT EXISTS master_hotel (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kota ENUM('mekkah','madinah') NOT NULL,
  bintang TINYINT NOT NULL,
  nama_hotel VARCHAR(150) NOT NULL,
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  urutan INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (kota, bintang, aktif)
);

CREATE TABLE IF NOT EXISTS master_hotel_periode (
  id INT AUTO_INCREMENT PRIMARY KEY,
  master_hotel_id INT NOT NULL,
  periode_mulai DATE NULL,
  periode_selesai DATE NULL,
  berlaku_sampai DATE NULL,
  rate_double DECIMAL(14,2) NOT NULL,
  rate_triple DECIMAL(14,2) NOT NULL,
  rate_quad DECIMAL(14,2) NOT NULL,
  mata_uang ENUM('SAR','USD','IDR') NOT NULL DEFAULT 'SAR',
  urutan INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (master_hotel_id)
);
