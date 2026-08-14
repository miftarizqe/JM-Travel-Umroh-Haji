-- Kunci ("Submit") laporan Laba Rugi per bulan atau per tahun — beda dari
-- cashflow_periode (yang ngunci transaksi + carry saldo antar bulan). Laba
-- Rugi murni hasil hitungan LIVE dari Cashflow + booking, jadi bisa diam-diam
-- berubah kalau data lama diedit atau kalau baris "reimburse belum dibayar"
-- (yang emang time-dependent) berubah status. Snapshot di sini yang
-- membekukan angkanya begitu user yakin sudah final.
CREATE TABLE IF NOT EXISTS laba_rugi_periode (
  id INT AUTO_INCREMENT PRIMARY KEY,
  periode VARCHAR(7) NOT NULL UNIQUE, -- 'YYYY-MM' (bulan) atau 'YYYY' (tahun)
  tipe ENUM('bulan','tahun') NOT NULL,
  status ENUM('draft','submitted') NOT NULL DEFAULT 'draft',
  data_snapshot JSON NULL,
  submitted_at TIMESTAMP NULL,
  submitted_by VARCHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
