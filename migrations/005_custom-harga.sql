-- ============================================
-- MIGRATION: tabel custom_harga_request
-- Pengajuan custom harga (dari agen/perwakilan) yang perlu di-ACC admin.
-- Jalankan sekali di MySQL, database: jm_travel
-- ============================================

CREATE TABLE IF NOT EXISTS custom_harga_request (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pengaju_id VARCHAR(36) NOT NULL,        -- user id agen/perwakilan
  pengaju_nama VARCHAR(150),
  pengaju_role VARCHAR(30),               -- 'agen' | 'perwakilan'
  prog_id VARCHAR(36) NOT NULL,
  prog_name VARCHAR(150),
  paket VARCHAR(30),
  kamar VARCHAR(30),
  harga_diajukan BIGINT,
  alasan VARCHAR(500),
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  catatan_admin VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
