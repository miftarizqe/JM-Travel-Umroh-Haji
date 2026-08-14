-- Klaim reimburse staff — kebalikan dari settlement (settlement: company
-- transfer duluan ke staff, rincian nyusul; reimburse: staff keluar duit
-- pribadi duluan, company bayar balik nyusul). Klaim gak terikat ke satu
-- periode/bulan tertentu (bisa keluar bulan ini, dibayar bulan depan) —
-- begitu dibayar baru jadi baris cashflow_transaksi beneran, di periode yang
-- lagi dibuka admin pas bayar (uang company gerak SEKARANG, bukan pas staff
-- belanja).
CREATE TABLE IF NOT EXISTS cashflow_reimburse (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tanggal_pengeluaran DATE NOT NULL,
  deskripsi VARCHAR(255) NOT NULL,
  kategori_id INT NULL,
  nominal BIGINT NOT NULL,
  nama_staff VARCHAR(150) NOT NULL,
  bukti_path VARCHAR(255) NULL,
  bukti_nama VARCHAR(255) NULL,
  status ENUM('belum_dibayar','sudah_dibayar') NOT NULL DEFAULT 'belum_dibayar',
  dibayar_transaksi_id INT NULL,
  dibayar_at TIMESTAMP NULL,
  input_oleh VARCHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (status),
  FOREIGN KEY (kategori_id) REFERENCES cashflow_kategori(id),
  FOREIGN KEY (dibayar_transaksi_id) REFERENCES cashflow_transaksi(id)
);
