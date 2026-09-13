-- ============================================================
-- MIGRATION: Role & fitur "koperasi" (Program Sejuta Bisa Umroh &
-- Haji, kerja sama BSI) — role rekrutmen baru mirip perwakilan,
-- funnel pendaftaran sendiri (bukti TF -> SPK-AK -> akun BSI ->
-- tabungan haji -> SK-CIF), 2 dokumen legal baru di sistem
-- dokumen_signature yang sudah ada, komisi flat sekali per
-- rekrutan (bukan multi-generasi, bukan nempel booking).
--
-- Jalankan: mysql -u root -p jm_travel < migration-koperasi.sql
-- ============================================================

-- 1) users: role baru + kolom penunjang funnel koperasi.
-- akun_bsi_status/tabungan_haji_status/cif_bsi sengaja permanen di
-- users (bukan cuma di staging), karena rekonsiliasi manual jalan
-- terus walau akun sudah aktif jadi recruiter.
ALTER TABLE users
  MODIFY COLUMN role ENUM('jamaah','perwakilan','admin','super_admin','koperasi') NOT NULL,
  ADD COLUMN cif_bsi VARCHAR(50) NULL,
  ADD COLUMN akun_bsi_status TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN akun_bsi_updated_at TIMESTAMP NULL,
  ADD COLUMN tabungan_haji_status TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN tabungan_haji_updated_at TIMESTAMP NULL,
  ADD COLUMN dokumen_spk_ak_fisik_path VARCHAR(255) NULL,
  ADD COLUMN dokumen_spk_ak_fisik_uploaded_at TIMESTAMP NULL,
  ADD COLUMN dokumen_sk_cif_fisik_path VARCHAR(255) NULL,
  ADD COLUMN dokumen_sk_cif_fisik_uploaded_at TIMESTAMP NULL,
  ADD COLUMN no_spk_ak VARCHAR(30) NULL,
  ADD COLUMN no_sk_cif VARCHAR(30) NULL;

-- 2) Tabel staging pendaftaran koperasi. Sengaja tabel baru, BUKAN
-- numpang di agen_pendaftaran — funnel koperasi linear 1 jalur (beda
-- bentuk dari agen_pendaftaran/status-pendaftaran perwakilan yang
-- 2-cabang kantor/paket dengan jadwal_kunjungan, dan punya banyak
-- kolom perwakilan-only yang gak relevan buat koperasi).
CREATE TABLE IF NOT EXISTS koperasi_pendaftaran (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  nama VARCHAR(150) NOT NULL,
  nik VARCHAR(20),
  tempat_lahir VARCHAR(100),
  tanggal_lahir DATE,
  jenis_kelamin VARCHAR(20),
  nama_ibu VARCHAR(150),
  alamat VARCHAR(500),
  alamat_ktp VARCHAR(500),
  alamat_domisili VARCHAR(500),
  kode_pos VARCHAR(10),
  wa VARCHAR(30) NOT NULL,
  email VARCHAR(100),
  pekerjaan VARCHAR(100),
  bank VARCHAR(50),
  no_rekening VARCHAR(50),
  nama_pemilik_rekening VARCHAR(150),
  foto_ktp_path VARCHAR(255),
  perekrut_id VARCHAR(36),
  bukti_tf_path VARCHAR(255),
  bukti_tf_uploaded_at TIMESTAMP NULL,
  bukti_tf_verified_at TIMESTAMP NULL,
  status ENUM('pending','menunggu_verifikasi_tf','menunggu_bsi','menunggu_sk_cif','active','ditolak')
         NOT NULL DEFAULT 'pending',
  catatan_admin VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3) dokumen_* : tambah 'spk_ak' (Surat Perjanjian Kerja Sama - Anggota
-- Koperasi, boleh digital/fisik) & 'sk_cif' (wajib fisik, terhubung CIF
-- BSI) ke 4 tabel yang pakai enum ini.
ALTER TABLE dokumen_signature
  MODIFY COLUMN dokumen ENUM('spka_ins','jamaah','formulir','invoice','spk_ak','sk_cif') NOT NULL;

ALTER TABLE dokumen_pasal
  MODIFY COLUMN dokumen ENUM('spka_ins','jamaah','spk_ak','sk_cif') NOT NULL;

-- Snapshot tables JANGAN pernah dipangkas nilainya — baris histori lama
-- masih mereferensikan 'spka'/'spkl' walau jenis dokumen itu udah gak
-- dipakai lagi (lihat migration-remove-agen-role.sql).
ALTER TABLE dokumen_pasal_snapshot
  MODIFY COLUMN dokumen ENUM('spka','spka_ins','spkl','jamaah','spk_ak','sk_cif') NOT NULL;

ALTER TABLE dokumen_signer_snapshot
  MODIFY COLUMN dokumen ENUM('spka','spka_ins','spkl','jamaah','spk_ak','sk_cif') NOT NULL;

-- 4) komisi_ledger: dukung komisi koperasi (flat, sekali per rekrutan
-- berhasil aktif — gak nempel ke booking sama sekali beda dari
-- reseller_perwakilan yang selalu nempel closing).
ALTER TABLE komisi_ledger
  MODIFY COLUMN booking_id VARCHAR(36) NULL,
  ADD COLUMN ref_id VARCHAR(36) NULL AFTER booking_id,
  MODIFY COLUMN jenis ENUM('reseller_perwakilan','komisi_koperasi') NOT NULL;

-- 5) pengaturan: nominal komisi flat koperasi, admin-configurable
-- (bukan hardcode), 1 baris global settings yang udah ada.
ALTER TABLE pengaturan
  ADD COLUMN komisi_koperasi_nominal BIGINT NOT NULL DEFAULT 0;
