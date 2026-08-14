-- ============================================================
-- MIGRATION: Perbaikan hasil tes 9 Juli 2026
-- Jalankan: mysql -u root -pJMTravel123! jm_travel < migration-fix-tes.sql
-- ============================================================

-- 1) BUG D8: tombol Nonaktifkan tidak berpengaruh.
--    Kolom status hanya ENUM('active','pending','rejected') —
--    nilai 'nonaktif' ditolak MySQL secara diam-diam.
ALTER TABLE users
  MODIFY COLUMN status ENUM('active','pending','rejected','nonaktif') DEFAULT 'active';

-- 2) Jamaah tidak perlu ACC admin: pastikan semua jamaah lama aktif
UPDATE users SET status = 'active' WHERE role = 'jamaah' AND status = 'pending';

-- 3) Fitur paspor belum jadi (C13)
--    Jamaah boleh mendaftar walau paspor belum ada.
--    Admin akan follow up via WhatsApp dan mengisi datanya nanti.
ALTER TABLE bookings
  ADD COLUMN ada_paspor_semua TINYINT DEFAULT 1 AFTER jamaah_data,
  ADD COLUMN catatan_paspor VARCHAR(255) DEFAULT NULL AFTER ada_paspor_semua;

-- 4) Sumber informasi pindah ke checkout (C13)
--    Kolom sumber_info & referral_* sudah ada di bookings, tidak perlu tambah.
--    Hanya pastikan indeksnya ada agar pencarian admin cepat.
CREATE INDEX idx_bookings_referral_agen ON bookings (referral_agen_id);
CREATE INDEX idx_bookings_referral_perw ON bookings (referral_perw_id);
