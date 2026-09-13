-- ============================================================
-- MIGRATION: WMS Perlengkapan Jamaah — stok, ledger in/out, dan
-- status pengiriman PER-JAMAAH (bukan per-booking, karena item
-- gender-spesifik seperti ihrom/mukena beda per orang).
--
-- Stok & ambang reorder cuma bisa dikelola/dilihat super_admin
-- (wajibSuperAdmin, src/lib/auth.js). Status pengiriman per-jamaah
-- boleh diupdate admin biasa (wajibRole(['admin'])).
--
-- Jalankan: mysql -u root -p jm_travel < migration-wms-perlengkapan.sql
-- ============================================================

ALTER TABLE perlengkapan_jamaah
  ADD COLUMN gender_spesifik ENUM('semua','laki','perempuan') NOT NULL DEFAULT 'semua' AFTER nama,
  ADD COLUMN stok_saat_ini INT NOT NULL DEFAULT 0,
  ADD COLUMN stok_minimum INT NOT NULL DEFAULT 0;

-- 'Kain Ihrom / Mukena' dulu 1 baris mewakili "salah satu dari dua" (item
-- fisiknya beda tergantung gender jamaah) — sekarang tiap baris harus jadi
-- 1 item fisik nyata biar stok & pengiriman per-gender bisa dihitung benar.
UPDATE perlengkapan_jamaah SET nama = 'Kain Ihrom', gender_spesifik = 'laki'
  WHERE nama = 'Kain Ihrom / Mukena';

UPDATE perlengkapan_jamaah SET urutan = urutan + 1 WHERE urutan > 6;
INSERT INTO perlengkapan_jamaah (urutan, nama, gender_spesifik, gambar)
  SELECT 7, 'Mukena', 'perempuan', gambar FROM perlengkapan_jamaah WHERE nama = 'Kain Ihrom';

CREATE TABLE perlengkapan_stok_ledger (
  id INT AUTO_INCREMENT PRIMARY KEY,
  item_id INT NOT NULL,
  tipe ENUM('in','out') NOT NULL,
  qty INT NOT NULL,
  keterangan VARCHAR(255) DEFAULT NULL,
  booking_id VARCHAR(20) DEFAULT NULL,
  jamaah_idx INT DEFAULT NULL,
  input_oleh VARCHAR(36) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_item (item_id),
  INDEX idx_booking (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE perlengkapan_pengiriman (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id VARCHAR(20) NOT NULL,
  jamaah_idx INT NOT NULL,
  status ENUM('belum_diproses','disiapkan','dikirim','diterima') NOT NULL DEFAULT 'belum_diproses',
  disiapkan_at TIMESTAMP NULL,
  dikirim_at TIMESTAMP NULL,
  diterima_at TIMESTAMP NULL,
  catatan VARCHAR(255) DEFAULT NULL,
  updated_oleh VARCHAR(36) DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_booking_jamaah (booking_id, jamaah_idx)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
