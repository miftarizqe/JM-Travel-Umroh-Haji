-- Nama pemilik rekening Tabungan Umroh (BSI) buat sahabat_baitullah — dikonfirmasi
-- user 2026-10-03. Rekening umrohnya kadang bukan atas nama sahabat sendiri, jadi
-- butuh field terpisah dari nama akun. Profil sahabat_baitullah sekarang nampilin
-- Bank/No. Rekening/Nama Pemilik Rekening dari rekening umroh ini (bukan lagi
-- field generik `bank`/`no_rekening`/`nama_pemilik_rekening` yang dipakai perwakilan).
ALTER TABLE users
  ADD COLUMN nama_pemilik_rekening_umroh VARCHAR(255) NULL AFTER no_rekening_tabungan_umroh;

-- Bug lama: form daftar-perwakilan & daftar-sahabat nyimpen alamat ke
-- alamat_ktp/alamat_domisili, tapi kolom `alamat` (yang ditampilkan & bisa
-- diedit di halaman Profil) gak pernah ikut disinkronkan. Backfill sekali buat
-- akun existing yang alamat-nya masih kosong (dikonfirmasi user 2026-10-03).
UPDATE users
SET alamat = COALESCE(NULLIF(alamat_domisili, ''), NULLIF(alamat_ktp, ''))
WHERE (alamat IS NULL OR alamat = '')
  AND (NULLIF(alamat_domisili, '') IS NOT NULL OR NULLIF(alamat_ktp, '') IS NOT NULL);
