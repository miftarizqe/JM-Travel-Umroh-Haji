-- Dual-role akun: satu orang bisa punya role kedua (Perwakilan + Sejuta
-- Baitullah/koperasi) SELAIN role utamanya, khusus buat yang direkrut
-- LANGSUNG oleh manajemen (bukan via link referral) — dikonfirmasi user
-- 2026-09-06. JWT/session tetap cuma bawa 1 role aktif ("mode" yang lagi
-- dipakai) — role_kedua cuma nyimpen role KEDUA yang dipunya akun ini,
-- bukan role aktif sesi. Ditukar lewat POST /api/auth/switch-role.
--
-- untuk_role_kedua di agen_pendaftaran/koperasi_pendaftaran menandai baris
-- pendaftaran itu buat NAMBAH role kedua ke akun yang sudah aktif (dimulai
-- admin dari /admin/database), BUKAN pendaftaran akun baru — dipakai di
-- langkah "advance ke active" biar tau harus nulis ke role_kedua, bukan
-- menimpa role utama.
--
-- Jalankan: mysql -u root -p jm_travel < migration-role-kedua.sql

ALTER TABLE users
  ADD COLUMN role_kedua ENUM('perwakilan','koperasi') NULL
    COMMENT 'Role kedua akun ini (selain role utama) — perwakilan+koperasi doang, direkrut langsung manajemen.'
    AFTER role,
  ADD COLUMN role_kedua_ditambahkan_at DATETIME NULL
    COMMENT 'Kapan admin memberi role kedua ini.';

ALTER TABLE koperasi_pendaftaran
  ADD COLUMN untuk_role_kedua TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Kalau 1, pendaftaran ini buat nambah role koperasi ke akun perwakilan yang sudah aktif (perekrut_id sengaja NULL, direkrut manajemen), bukan pendaftaran akun baru.';

ALTER TABLE agen_pendaftaran
  ADD COLUMN untuk_role_kedua TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Kalau 1, pendaftaran ini buat nambah role perwakilan ke akun koperasi yang sudah aktif (perekrut_id sengaja NULL, direkrut manajemen), bukan pendaftaran akun baru.';
