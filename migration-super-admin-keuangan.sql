-- Level admin tambahan (super admin) khusus buat lihat laporan keuangan
-- PERUSAHAAN (bukan cuma per-booking) — termasuk pengeluaran operasional
-- (gaji, sewa, dll) yang sifatnya sensitif, gak untuk semua admin biasa.
-- Sengaja pakai FLAG di atas role='admin' yang sudah ada (bukan role baru)
-- supaya SEMUA pengecekan wajibRole(['admin']) yang sudah ada di puluhan
-- endpoint tetap jalan apa adanya buat super admin juga — gak perlu ubah
-- satu-satu, cuma nambah 1 pengecekan EKSTRA di endpoint yang sensitif.
ALTER TABLE users
  ADD COLUMN is_super_admin TINYINT(1) DEFAULT 0 AFTER role;

-- Pengeluaran operasional perusahaan (gaji, sewa, marketing, dll) — data
-- yang SEBELUMNYA gak ada tempatnya sama sekali di sistem ini (laporan
-- keuangan yang sudah ada cuma nyakup pendapatan booking/HPP/komisi).
CREATE TABLE IF NOT EXISTS pengeluaran_operasional (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tanggal DATE NOT NULL,
  kategori ENUM('gaji','sewa','marketing','utilitas','lain_lain') NOT NULL DEFAULT 'lain_lain',
  keterangan VARCHAR(255),
  nominal BIGINT NOT NULL,
  input_oleh VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tanggal (tanggal)
);
