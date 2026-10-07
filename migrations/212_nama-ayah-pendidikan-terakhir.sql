-- Data tambahan yang dibutuhkan buat daftar Siskopatuh (dikonfirmasi user
-- 2026-10-07): nama ayah kandung & pendidikan terakhir. `pekerjaan` udah
-- ada dari dulu (dipakai bareng), `nama_ibu` juga udah ada -- `nama_ayah`
-- & `pendidikan_terakhir` BARU, ditaruh di 3 tabel yang udah punya pola
-- sama (users, sahabat_pendaftaran, agen_pendaftaran) biar konsisten sama
-- nama_ibu/pekerjaan yang udah ada di situ.
ALTER TABLE users
  ADD COLUMN nama_ayah VARCHAR(255) NULL AFTER nama_ibu,
  ADD COLUMN pendidikan_terakhir VARCHAR(50) NULL AFTER pekerjaan;

ALTER TABLE sahabat_pendaftaran
  ADD COLUMN nama_ayah VARCHAR(150) NULL AFTER nama_ibu,
  ADD COLUMN pendidikan_terakhir VARCHAR(50) NULL AFTER pekerjaan;

ALTER TABLE agen_pendaftaran
  ADD COLUMN nama_ayah VARCHAR(150) NULL AFTER nama_ibu,
  ADD COLUMN pendidikan_terakhir VARCHAR(50) NULL AFTER pekerjaan;
