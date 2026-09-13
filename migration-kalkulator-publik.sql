-- ============================================
-- MIGRATION: Kalkulator Estimasi Publik (paket private/custom, login-gated,
-- lead capture)
--
-- kalkulator_template_publik = paket yang dikurasi admin (nama/foto/deskripsi
-- + config_json snapshot state KalkulatorTerpadu {shared,hotel,malam,komisi,
-- margin}) buat dipilih pengunjung publik. config_json TIDAK PERNAH dikirim
-- ke client publik — cuma dibaca server-side pas hitung harga.
--
-- kalkulator_lead = 1 baris per KALI pengunjung berhasil hitung estimasi
-- (bukan upsert — riwayat tiap eksplorasi tetap tersimpan, ini yang dipakai
-- buat database lead follow-up admin). harga_jual = angka final SAJA, HPP/
-- komisi/margin TIDAK PERNAH disimpan di sini.
--
-- Jalankan sekali di MySQL, database: jm_travel
-- ============================================

CREATE TABLE IF NOT EXISTS kalkulator_template_publik (
  id VARCHAR(36) PRIMARY KEY,
  nama VARCHAR(150) NOT NULL,
  deskripsi TEXT,
  gambar VARCHAR(255),
  config_json JSON NOT NULL,
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  urutan INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS kalkulator_lead (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  template_id VARCHAR(36) NOT NULL,
  paket VARCHAR(30) NOT NULL,
  kamar VARCHAR(30) NOT NULL,
  tanggal_berangkat DATE,
  addon_config JSON,
  harga_jual BIGINT NOT NULL,
  status ENUM('estimasi','diajukan') NOT NULL DEFAULT 'estimasi',
  status_tindak_lanjut ENUM('baru','dihubungi','selesai') NOT NULL DEFAULT 'baru',
  diajukan_at TIMESTAMP NULL,
  catatan_admin VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id),
  INDEX (template_id),
  INDEX (status, status_tindak_lanjut),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (template_id) REFERENCES kalkulator_template_publik(id)
);
