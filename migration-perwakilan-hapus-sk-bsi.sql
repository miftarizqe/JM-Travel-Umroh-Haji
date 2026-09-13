-- SK BSI (Surat Kuasa BSI, dokumen scan yang diunggah admin) dihapus total
-- dari alur pendaftaran perwakilan — bukan lagi syarat verifikasi (dikonfirmasi
-- user 2026-08-19). Bersihkan status lama dulu sebelum ubah ENUM biar gak ada
-- baris yang nyangkut di nilai yang bakal dihapus.
UPDATE agen_pendaftaran SET status = 'pending' WHERE status = 'sk_bsi_verified';
UPDATE users SET reg_status = 'pending' WHERE reg_status IN ('pending_sk_bsi', 'sk_bsi_verified');

ALTER TABLE agen_pendaftaran
  DROP COLUMN sk_bsi_path,
  MODIFY COLUMN status ENUM('pending','docs_sent','waiting_docs_return','waiting_visit','active','ditolak') DEFAULT 'pending';

-- users.reg_status defaultnya 'pending_sk_bsi' (dari migrasi lama) — akun
-- perwakilan yang baru register langsung (role='perwakilan' sejak signup)
-- kena default ini sebelum sempat isi formulir sama sekali.
ALTER TABLE users MODIFY COLUMN reg_status VARCHAR(50) DEFAULT 'pending';
