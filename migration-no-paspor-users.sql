-- No. Paspor buat identitas Pihak Kedua di SPK-AK (Surat Perjanjian Jamaah
-- Umroh Program Sahabat Baitullah, revisi 2026-09-11) — opsional/self-service,
-- boleh diisi menyusul (bukan syarat/gate registrasi).
ALTER TABLE users
  ADD COLUMN no_paspor VARCHAR(20) NULL;
