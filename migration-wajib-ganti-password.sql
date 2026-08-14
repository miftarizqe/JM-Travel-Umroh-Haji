USE jm_travel;

-- Dipakai buat alur "reset password massal" — admin generate password
-- sementara buat akun lama (yang udah py password tapi gak diketahui
-- pemiliknya, mis. di-set pas migrasi data sebelum web live), lalu paksa
-- orangnya ganti sendiri begitu pertama kali login. Flag ini dicek di
-- Layout.jsx tiap halaman — kalau nyala, user dialihkan ke
-- /ganti-password-wajib dan gak bisa akses halaman lain sampai selesai ganti.
ALTER TABLE users
  ADD COLUMN wajib_ganti_password TINYINT(1) DEFAULT 0;
