-- Form bikin akun Agen ditambah data: Tempat Lahir, Rekening Ujroh (bank +
-- no rekening + nama pemilik), foto KTP, Perekrut (dikonfirmasi user
-- 2026-10-21). Kolom-kolom itu generik, udah ada di users (dipakai
-- perwakilan/sahabat) -- gak perlu kolom baru, CUMA wa & nik yang perlu
-- dilonggarin jadi opsional (sebelumnya NOT NULL, berlaku semua role).
-- UNIQUE KEY tetap aman -- MySQL/MariaDB izinin banyak baris NULL di bawah
-- UNIQUE index (NULL != NULL).
ALTER TABLE users MODIFY COLUMN wa VARCHAR(20) NULL;
ALTER TABLE users MODIFY COLUMN nik VARCHAR(16) NULL;
