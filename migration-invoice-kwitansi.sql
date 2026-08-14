-- Invoice DP/Pelunasan & Kwitansi Pembayaran untuk jamaah — bisa dibuat
-- otomatis (tarik dari data booking/payment yang sudah dikonfirmasi) atau
-- manual, dua-duanya konsumsi nomor urut resmi yang sama (dari
-- nomor_surat_counter, sudah ada dari migration-nomor-perjanjian.sql) —
-- Invoice DP & Invoice Pelunasan berbagi 1 seri nomor (jenis counter 'INV'),
-- Kwitansi punya seri sendiri ('KWT'). Nomor dibekukan permanen di kolom
-- `nomor` begitu digenerate — cetak ulang gak bikin nomor baru.
CREATE TABLE IF NOT EXISTS invoice_kwitansi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nomor VARCHAR(50) NOT NULL,
  jenis ENUM('invoice_dp','invoice_pelunasan','kwitansi') NOT NULL,
  booking_id VARCHAR(20) NULL,
  nama VARCHAR(150) NOT NULL,
  nominal BIGINT NOT NULL,
  keterangan TEXT NULL,
  tanggal DATE NOT NULL,
  is_manual TINYINT(1) NOT NULL DEFAULT 0,
  dibuat_oleh VARCHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dibuat_oleh) REFERENCES users(id)
);
