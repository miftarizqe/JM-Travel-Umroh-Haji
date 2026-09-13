ALTER TABLE komisi_ledger
  MODIFY COLUMN jenis ENUM('reseller_perwakilan','komisi_koperasi','closing_langsung_koperasi','tabungan_awal_sejuta','head_of_program_registrasi','pemakaian_saldo_sejuta','setoran_mandiri_sejuta','ujroh_perwakilan') NOT NULL;

CREATE TABLE pengajuan_ujroh_perwakilan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  prog_id VARCHAR(36) NOT NULL,
  status ENUM('draft','diajukan','disetujui','ditolak') NOT NULL DEFAULT 'draft',
  grand_total BIGINT NOT NULL DEFAULT 0,
  jumlah_baris INT NOT NULL DEFAULT 0,
  dibuat_oleh VARCHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  diajukan_oleh VARCHAR(36) NULL,
  diajukan_at TIMESTAMP NULL,
  diputuskan_oleh VARCHAR(36) NULL,
  diputuskan_at TIMESTAMP NULL,
  catatan_keputusan VARCHAR(500) NULL,
  bukti_ttd_path VARCHAR(255) NULL,
  FOREIGN KEY (prog_id) REFERENCES programs(id),
  INDEX (status),
  INDEX (prog_id)
);

ALTER TABLE komisi_ledger
  ADD COLUMN pengajuan_ujroh_perwakilan_id INT NULL,
  ADD FOREIGN KEY (pengajuan_ujroh_perwakilan_id) REFERENCES pengajuan_ujroh_perwakilan(id);
