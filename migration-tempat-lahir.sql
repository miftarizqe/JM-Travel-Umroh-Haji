-- Tempat lahir belum ada kolomnya sama sekali (cuma tanggal_lahir) — perlu
-- utk field "Tempat, Tanggal Lahir" yang lengkap di formulir & database agen.
ALTER TABLE users
  ADD COLUMN tempat_lahir VARCHAR(100) NULL;

ALTER TABLE agen_pendaftaran
  ADD COLUMN tempat_lahir VARCHAR(100) NULL;

ALTER TABLE perwakilan_pendaftaran
  ADD COLUMN tempat_lahir VARCHAR(100) NULL;
