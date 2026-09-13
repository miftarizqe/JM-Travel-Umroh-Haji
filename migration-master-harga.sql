-- ============================================
-- MIGRATION: Master Harga Hotel & Tiket Pesawat (per periode)
--
-- Sumber tunggal rate hotel Mekkah/Madinah & tiket pesawat, per periode
-- tanggal — dipakai admin buat "Isi dari Master" pas ngisi form kalkulator
-- (KalkulatorTerpadu.jsx: Costing Program, Kalkulator Estimasi Publik
-- kurasi/baseline). Ini SNAPSHOT/copy doang, BUKAN live-link — nyalin nilai
-- ke state form kalkulator saat itu, ubah master belakangan TIDAK ngubah
-- kalkulator yang udah pernah "diisi dari master" sebelumnya (dikonfirmasi
-- user 2026-08-16). Beda dari modul_negara_tier: gak ada bracket pax
-- (harga hotel/tiket gak bertingkat per jumlah orang), dan matching-nya
-- MANUAL (admin pilih dari daftar), bukan auto-resolve by tanggal.
--
-- Jalankan sekali di MySQL, database: jm_travel
-- ============================================

CREATE TABLE IF NOT EXISTS master_hotel_rate (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kota ENUM('mekkah','madinah') NOT NULL,
  nama_hotel VARCHAR(150) NOT NULL,
  periode_mulai DATE NULL,
  periode_selesai DATE NULL,
  rate_double DECIMAL(14,2) NOT NULL,
  rate_triple DECIMAL(14,2) NOT NULL,
  rate_quad DECIMAL(14,2) NOT NULL,
  mata_uang ENUM('SAR','USD','IDR') NOT NULL DEFAULT 'SAR',
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  urutan INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (kota, aktif)
);

CREATE TABLE IF NOT EXISTS master_tiket_rate (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama_rute VARCHAR(150) NOT NULL,
  rute ENUM('direct','transit') NULL,
  periode_mulai DATE NULL,
  periode_selesai DATE NULL,
  rate DECIMAL(14,2) NOT NULL,
  mata_uang ENUM('SAR','USD','IDR') NOT NULL DEFAULT 'IDR',
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  urutan INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (aktif)
);
