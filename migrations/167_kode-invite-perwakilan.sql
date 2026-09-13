-- Kode undangan rekrut-perwakilan-baru — TERPISAH dari kode_unik (yang
-- sekuensial/predictable & udah dipublikasikan di banyak tempat: link
-- referral jamaah, ID card, dsb). kode_unik TETAP dipakai apa adanya buat
-- semua itu — kolom baru ini KHUSUS buat gate "wajib punya kode referral
-- perwakilan aktif" saat pendaftaran akun Perwakilan baru (dikonfirmasi
-- user 2026-09-03), digenerate random 1x begitu status perwakilan jadi
-- 'active', supaya gak bisa ditebak/di-brute-force kayak kode_unik.
--
-- Jalankan: mysql -u root -p jm_travel < migration-kode-invite-perwakilan.sql
ALTER TABLE users
  ADD COLUMN kode_invite_perwakilan VARCHAR(10) NULL UNIQUE
    COMMENT 'Kode acak khusus rekrut perwakilan baru — TERPISAH dari kode_unik, digenerate sekali pas status jadi active.';
