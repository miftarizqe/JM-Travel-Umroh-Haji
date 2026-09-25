-- OTP registrasi dihapus (2026-09-23), nantinya diganti approval admin.
-- Akun lama yang belum sempat verifikasi OTP ditandai terverifikasi supaya
-- tidak terkunci di gerbang cekPemesanBolehOrder / prasyarat daftar-perwakilan.
UPDATE users SET terverifikasi = 1, verifikasi_kode = NULL, verifikasi_expired = NULL
WHERE terverifikasi = 0;
