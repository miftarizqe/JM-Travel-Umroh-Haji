USE jm_travel;

-- Scan/foto Formulir Pendaftaran agen/perwakilan yang sudah ditandatangani
-- fisik — pola sama seperti dokumen_pks_fisik_path, tapi ini dokumen yang
-- BEDA (Formulir Pendaftaran, bukan SPKA/SPKA-Ins/SPKL), jadi kolom sendiri.
ALTER TABLE users
  ADD COLUMN formulir_pendaftaran_fisik_path VARCHAR(255) NULL,
  ADD COLUMN formulir_pendaftaran_fisik_uploaded_at TIMESTAMP NULL;
