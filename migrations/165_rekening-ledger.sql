-- 3 rekening JM Travel (dikonfirmasi user 2026-09-02):
--   1. Alkhalid Jaya Megah — rekening kantor pemilik, terima SEMUA pembayaran
--      program umroh biasa (DP + pelunasan), KECUALI booking program
--      publish_type='koperasi' (Program Sejuta Baitullah eksklusif).
--      Keluar: ujroh perwakilan yang di-TF.
--   2. Cashflow — SUDAH ADA (cashflow_akun/periode/transaksi), operasional
--      kantor, TIDAK didup di sini, cuma disurface bareng di dashboard.
--   3. Sejuta Baitullah — rekening baru, terima setoran Rp1jt pendaftaran
--      anggota baru. Keluar: ujroh 5-generasi yang di-TF ke anggota.
CREATE TABLE rekening_ledger (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rekening ENUM('alkhalid', 'sejuta_baitullah') NOT NULL,
  jenis ENUM('masuk', 'keluar') NOT NULL,
  sumber_tipe VARCHAR(50) NOT NULL,
  sumber_id VARCHAR(64) NULL,
  nominal BIGINT NOT NULL,
  keterangan VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (rekening),
  INDEX (created_at)
);
