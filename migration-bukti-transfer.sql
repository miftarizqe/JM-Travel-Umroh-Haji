-- ============================================================
-- MIGRATION: Bukti transfer di tabel payments
-- Sebelumnya: upload hanya dummy (klik = uploaded), file tidak pernah
-- tersimpan. Admin approve tanpa bisa melihat bukti apa pun.
-- Jalankan sekali di MySQL, database: jm_travel
-- ============================================================

ALTER TABLE payments
  ADD COLUMN bukti_path VARCHAR(255) DEFAULT NULL AFTER kode_unik,
  ADD COLUMN bukti_nama VARCHAR(255) DEFAULT NULL AFTER bukti_path,
  ADD COLUMN bukti_uploaded_at TIMESTAMP NULL DEFAULT NULL AFTER bukti_nama;
