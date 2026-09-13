CREATE TABLE pengajuan_ujroh (
  id INT AUTO_INCREMENT PRIMARY KEY,
  periode_mulai DATE NOT NULL,
  periode_selesai DATE NOT NULL,
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
  INDEX (status)
);

ALTER TABLE komisi_ledger
  ADD COLUMN pengajuan_ujroh_id INT NULL,
  ADD FOREIGN KEY (pengajuan_ujroh_id) REFERENCES pengajuan_ujroh(id);
