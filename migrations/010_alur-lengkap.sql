-- ============================================================
-- MIGRATION BESAR — Perbaikan Alur Pendaftaran & Fitur Baru
-- Jalankan sekali: mysql -u root -pJMTravel123! jm_travel < migration-alur-lengkap.sql
-- ============================================================

-- 1) BUG UTAMA: tabel agen_pendaftaran tidak pernah dibuat
--    (API daftar-agen menulis ke tabel yang tidak ada -> error & macet)
CREATE TABLE IF NOT EXISTS agen_pendaftaran (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  nama VARCHAR(150) NOT NULL,
  nik VARCHAR(20) NOT NULL,
  tanggal_lahir DATE,
  jenis_kelamin VARCHAR(20),
  nama_ibu VARCHAR(150),
  alamat VARCHAR(500),
  kode_pos VARCHAR(10),
  wa VARCHAR(30) NOT NULL,
  email VARCHAR(100),
  pekerjaan VARCHAR(100),
  bank VARCHAR(50),
  no_rekening VARCHAR(50),
  nama_pemilik_rekening VARCHAR(150),
  perekrut_id VARCHAR(36),
  jadwal_kunjungan VARCHAR(100),
  metode ENUM('kantor','paket') DEFAULT 'kantor',
  -- Berkas
  sk_bsi_path VARCHAR(255),
  materai_path VARCHAR(255),
  -- Persetujuan
  setuju_pks TINYINT DEFAULT 0,
  setuju_pks_at TIMESTAMP NULL,
  status ENUM('pending','sk_bsi_verified','docs_sent','waiting_docs_return','waiting_visit','active','ditolak') DEFAULT 'pending',
  catatan_admin VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_status (status)
);

-- 2) Tabel pendaftaran perwakilan (sebelumnya juga tidak ada)
CREATE TABLE IF NOT EXISTS perwakilan_pendaftaran (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  nama_lembaga VARCHAR(200) NOT NULL,
  jenis_lembaga VARCHAR(100),
  nama_pj VARCHAR(150) NOT NULL,
  nik_pj VARCHAR(20),
  wa VARCHAR(30) NOT NULL,
  email VARCHAR(100),
  alamat VARCHAR(500),
  wilayah VARCHAR(150),
  bank VARCHAR(50),
  no_rekening VARCHAR(50),
  nama_pemilik_rekening VARCHAR(150),
  dokumen_path VARCHAR(255),
  setuju_pks TINYINT DEFAULT 0,
  setuju_pks_at TIMESTAMP NULL,
  status ENUM('pending','verified','active','ditolak') DEFAULT 'pending',
  catatan_admin VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
);

-- 3) Foto profil (untuk ID card) + verifikasi akun
ALTER TABLE users
  ADD COLUMN foto_path VARCHAR(255) DEFAULT NULL AFTER nik,
  ADD COLUMN verifikasi_metode ENUM('whatsapp','email') DEFAULT NULL AFTER foto_path,
  ADD COLUMN verifikasi_kode VARCHAR(10) DEFAULT NULL AFTER verifikasi_metode,
  ADD COLUMN verifikasi_expired DATETIME DEFAULT NULL AFTER verifikasi_kode,
  ADD COLUMN terverifikasi TINYINT DEFAULT 0 AFTER verifikasi_expired,
  ADD COLUMN setuju_pks TINYINT DEFAULT 0 AFTER terverifikasi,
  ADD COLUMN setuju_pks_at TIMESTAMP NULL AFTER setuju_pks;

-- 4) Persetujuan PKS untuk jamaah (per booking)
ALTER TABLE bookings
  ADD COLUMN setuju_pks TINYINT DEFAULT 0 AFTER jamaah_data,
  ADD COLUMN setuju_pks_at TIMESTAMP NULL AFTER setuju_pks;

-- 5) Akun lama dianggap sudah terverifikasi (agar tidak terkunci)
UPDATE users SET terverifikasi = 1 WHERE terverifikasi = 0;
