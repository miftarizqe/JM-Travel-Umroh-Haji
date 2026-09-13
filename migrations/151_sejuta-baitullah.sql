-- ============================================================
-- MIGRATION: Mekanisme komisi "Sejuta Baitullah" (rebrand dari "koperasi")
-- — 5 generasi ujroh ke atas rantai referral (ganti komisi flat lama),
-- tabungan awal jemaah baru, dan komisi Head of Program (2 pemicu: tiap
-- registrasi + tiap Jamaah Sejuta Baitullah closing langsung buat dirinya
-- sendiri, yang kedua REUSE mekanisme closing_langsung_koperasi yang udah
-- ada). Semua nominal admin-configurable, angka default dari deck PPT.
--
-- Jalankan: mysql -u root -p jm_travel < migration-sejuta-baitullah.sql
-- ============================================================

ALTER TABLE pengaturan
  ADD COLUMN sejuta_gen1_nominal BIGINT NOT NULL DEFAULT 200000,
  ADD COLUMN sejuta_gen2_nominal BIGINT NOT NULL DEFAULT 150000,
  ADD COLUMN sejuta_gen3_nominal BIGINT NOT NULL DEFAULT 150000,
  ADD COLUMN sejuta_gen4_nominal BIGINT NOT NULL DEFAULT 100000,
  ADD COLUMN sejuta_gen5_nominal BIGINT NOT NULL DEFAULT 100000,
  ADD COLUMN sejuta_tabungan_awal_nominal BIGINT NOT NULL DEFAULT 100000,
  ADD COLUMN sejuta_head_of_program_nominal BIGINT NOT NULL DEFAULT 100000,
  ADD COLUMN head_of_program_user_id VARCHAR(36) NULL;

ALTER TABLE komisi_ledger
  MODIFY COLUMN jenis ENUM('reseller_perwakilan','komisi_koperasi','closing_langsung_koperasi','tabungan_awal_sejuta','head_of_program_registrasi') NOT NULL;
