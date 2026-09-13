-- Dua perbaikan gap pendaftaran Sejuta Baitullah (dikonfirmasi user 2026-09-03):
-- 1) Referral rekrut-koperasi-baru dikunci pakai kode invite acak, mirror
--    persis pola kode_invite_perwakilan — bukan dropdown bebas pilih nama lagi.
-- 2) Admin bisa tandai 1+ metode pembayaran "khusus buat setoran pendaftaran
--    Sejuta Baitullah" — beda dari rekening umum booking, karena nanti akan
--    ada rekening terpisah khusus utk ini.
-- Jalankan: mysql -u root -p jm_travel < migration-koperasi-referral-permanen-dan-rekening.sql

ALTER TABLE users
  ADD COLUMN kode_invite_koperasi VARCHAR(10) UNIQUE
    COMMENT 'Kode acak (BUKAN kode_unik yg sekuensial) buat gerbang wajib pendaftaran Jamaah Sejuta Baitullah baru — mirror kode_invite_perwakilan.';

ALTER TABLE metode_pembayaran
  ADD COLUMN khusus_koperasi TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Kalau 1, metode ini ditampilkan sbg tujuan TF setoran pendaftaran Rp1.000.000 Sejuta Baitullah. Kalau belum ada satupun yg ditandai, fallback ke semua metode aktif (dikonfirmasi user, biar gak nge-block tampilan sebelum admin sempat setting).';
