-- Tambah kolom role_diajukan ke agen_pendaftaran supaya tabel & alur
-- verifikasi SK BSI yang sama (status-pendaftaran) bisa dipakai untuk
-- pendaftaran perwakilan juga, bukan cuma agen. Default 'agen' supaya
-- baris lama (semua dari /daftar-agen) tetap benar tanpa perlu backfill.
ALTER TABLE agen_pendaftaran
  ADD COLUMN role_diajukan ENUM('agen','perwakilan') NOT NULL DEFAULT 'agen' AFTER user_id;
