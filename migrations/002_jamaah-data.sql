-- ============================================
-- MIGRATION: kolom jamaah_data di tabel bookings
-- Menyimpan detail semua jamaah (nama, paspor, KTP, dll) sebagai JSON
-- Jalankan sekali di MySQL, database: jm_travel
-- ============================================

ALTER TABLE bookings
  ADD COLUMN jamaah_data JSON DEFAULT NULL AFTER form_total;
