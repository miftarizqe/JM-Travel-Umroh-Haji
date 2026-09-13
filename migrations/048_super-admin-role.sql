-- Ganti pendekatan: super_admin jadi ROLE TERPISAH (bukan flag di atas
-- role='admin' seperti migration-super-admin-keuangan.sql sebelumnya) —
-- superset dari admin (bisa semua yang admin bisa, lihat src/lib/auth.js
-- cocokRole()), ditambah akses laporan keuangan perusahaan yang sensitif.
ALTER TABLE users
  MODIFY COLUMN role ENUM('jamaah','agen','perwakilan','admin','super_admin') NOT NULL;

-- Flag is_super_admin sudah gak dipakai lagi, diganti role di atas.
ALTER TABLE users
  DROP COLUMN is_super_admin;
