-- Pendapatan lain di luar booking program (merchandise, sewa aset/bus, dll)
CREATE TABLE IF NOT EXISTS pendapatan_lain (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tanggal DATE NOT NULL,
  kategori ENUM('merchandise','sewa_aset','lain_lain') NOT NULL DEFAULT 'lain_lain',
  keterangan VARCHAR(255) NULL,
  nominal BIGINT NOT NULL,
  input_oleh VARCHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (tanggal)
);
