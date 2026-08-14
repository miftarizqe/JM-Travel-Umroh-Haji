-- ============================================================
-- MIGRATION: Pembatalan Program (Cancel Booking)
-- Jalankan: mysql -u root -pJMTravel123! jm_travel < migration-pembatalan.sql
--
-- Aturan:
--   - Belum bayar DP        -> jamaah bisa BATALKAN LANGSUNG, tanpa persetujuan
--   - Sudah bayar DP        -> harus MENGAJUKAN, admin yang memutuskan
--   - Kesalahan JM Travel   -> refund 100% (DP + pembayaran lain)
--   - Bukan kesalahan JMT   -> refund mengikuti S&K (nominal ditentukan admin)
-- ============================================================

CREATE TABLE IF NOT EXISTS pembatalan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,

  -- Pengajuan dari jamaah
  alasan VARCHAR(500) NOT NULL,
  bukti_path VARCHAR(255) DEFAULT NULL,   -- opsional: bukti pendukung

  -- Kondisi saat diajukan (disimpan agar tidak berubah kemudian)
  dp_sudah_dibayar TINYINT DEFAULT 0,
  total_sudah_dibayar BIGINT DEFAULT 0,

  -- Keputusan admin
  status ENUM('menunggu','disetujui','ditolak') DEFAULT 'menunggu',
  penyebab ENUM('kesalahan_jm_travel','permintaan_jamaah','lainnya') DEFAULT NULL,
  refund_nominal BIGINT DEFAULT 0,
  refund_persen INT DEFAULT 0,
  catatan_admin VARCHAR(500) DEFAULT NULL,
  diproses_oleh VARCHAR(36) DEFAULT NULL,
  diproses_at TIMESTAMP NULL DEFAULT NULL,

  -- Status pengembalian dana
  refund_status ENUM('belum','diproses','selesai') DEFAULT 'belum',
  refund_bukti_path VARCHAR(255) DEFAULT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_booking (booking_id),
  INDEX idx_user (user_id),
  INDEX idx_status (status)
);

-- Status booking: tambah 'dibatalkan'
ALTER TABLE bookings
  MODIFY COLUMN status ENUM('active','selesai','batal','dibatalkan','menunggu_batal') DEFAULT 'active';
