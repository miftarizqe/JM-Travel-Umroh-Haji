-- Pisah alamat jadi KTP vs domisili (bisa beda), + foto KTP untuk agen.
-- Kolom `alamat` lama TETAP ADA (jangan di-drop) — data 83 agen yang sudah
-- diimpor cuma punya alamat tunggal, biar tetap kebaca sebagai fallback
-- sampai mereka isi ulang lewat formulir yang sudah dipisah.
ALTER TABLE users
  ADD COLUMN alamat_ktp TEXT NULL,
  ADD COLUMN alamat_domisili TEXT NULL,
  ADD COLUMN foto_ktp_path VARCHAR(255) NULL;

ALTER TABLE agen_pendaftaran
  ADD COLUMN alamat_ktp VARCHAR(500) NULL,
  ADD COLUMN alamat_domisili VARCHAR(500) NULL,
  ADD COLUMN foto_ktp_path VARCHAR(255) NULL;

ALTER TABLE perwakilan_pendaftaran
  ADD COLUMN alamat_ktp VARCHAR(500) NULL,
  ADD COLUMN alamat_domisili VARCHAR(500) NULL,
  ADD COLUMN foto_ktp_path VARCHAR(255) NULL;
