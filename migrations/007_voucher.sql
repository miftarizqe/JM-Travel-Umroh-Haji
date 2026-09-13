-- ============================================================
-- MIGRATION: Sistem Voucher (admin bikin, agen pakai)
-- Jalankan sekali di MySQL, database: jm_travel
--
-- Aturan:
--  - Hanya ADMIN yang membuat kode voucher.
--  - AGEN memakai kode saat closing jamaahnya (juga bisa dipakai jamaah
--    saat checkout mandiri).
--  - Diskon memotong porsi KOMISI PRIBADI agen. HPP tidak berkurang.
--  - Batas maks diskon = porsi pribadi paket:
--      signature (B5) 3.000.000 | eksekutif (B4) 2.000.000 | deluxe (B3) 1.000.000
-- ============================================================

-- 1) Lengkapi tabel vouchers (kuota, status aktif, batasan program)
ALTER TABLE vouchers
  ADD COLUMN kuota INT DEFAULT 1 AFTER potongan,
  ADD COLUMN terpakai INT DEFAULT 0 AFTER kuota,
  ADD COLUMN aktif TINYINT DEFAULT 1 AFTER terpakai,
  ADD COLUMN prog_id VARCHAR(36) DEFAULT NULL AFTER aktif,
  ADD COLUMN dibuat_oleh VARCHAR(36) DEFAULT NULL AFTER prog_id;

-- Voucher lama yang sudah dipakai: samakan dengan skema kuota baru
UPDATE vouchers SET terpakai = 1, kuota = 1 WHERE used = 1;
UPDATE vouchers SET terpakai = 0, kuota = 1 WHERE used = 0 OR used IS NULL;

-- 2) Simpan voucher yang dipakai pada booking
ALTER TABLE bookings
  ADD COLUMN voucher_kode VARCHAR(50) DEFAULT NULL AFTER total_harga,
  ADD COLUMN voucher_nominal BIGINT DEFAULT 0 AFTER voucher_kode;
