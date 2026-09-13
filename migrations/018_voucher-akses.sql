-- Voucher: akses (siapa boleh pakai) + tampil (muncul di halaman /voucher atau
-- disembunyikan/search-only) sebagai 2 pengaturan independen. kuota & valid_until
-- TIDAK butuh kolom baru — sudah nullable, tinggal diperlakukan "unlimited kalau
-- NULL" secara konsisten (kuota sekarang dihitung per-jamaah, bukan per-booking).
ALTER TABLE vouchers
  ADD COLUMN akses_role ENUM('publik','agen','perwakilan','akun') NOT NULL DEFAULT 'publik' AFTER for_user,
  ADD COLUMN tampil TINYINT DEFAULT 1 AFTER akses_role;

-- Voucher lama yang sudah pakai for_user otomatis jadi 'akun' (perilaku sama seperti sebelumnya)
UPDATE vouchers SET akses_role = 'akun' WHERE for_user IS NOT NULL;
