-- Pengajuan Dana Bulanan — dokumen RENCANA/APPROVAL sebelum bulan berjalan
-- (estimasi kebutuhan operasional + reimburse yang masih nunggak), TERPISAH
-- dari cashflow_periode (yang nyatetin uang yang UDAH gerak/aktual). Gak
-- ada efek otomatis ke cashflow sama sekali — murni alur ajuin -> approve.
--
-- Alur status: draft (bebas diedit) -> diajukan (terkunci, nunggu keputusan)
-- -> disetujui / ditolak (final).
CREATE TABLE pengajuan_dana (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bulan CHAR(7) NOT NULL COMMENT 'YYYY-MM, bulan yang DIAJUKAN (bukan bulan dibuatnya)',
  status ENUM('draft','diajukan','disetujui','ditolak') NOT NULL DEFAULT 'draft',
  catatan VARCHAR(500) NULL COMMENT 'catatan dari pengaju',
  created_by VARCHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  diajukan_oleh VARCHAR(36) NULL,
  diajukan_at TIMESTAMP NULL,
  diputuskan_oleh VARCHAR(36) NULL,
  diputuskan_at TIMESTAMP NULL,
  catatan_keputusan VARCHAR(500) NULL,
  INDEX (bulan),
  INDEX (status)
);

-- Baris per kebutuhan — bisa manual (estimasi operasional per kategori) atau
-- ditarik otomatis dari reimburse yang belum dibayar (sumber='reimburse',
-- reimburse_id kesimpen buat jejak, biar gampang cross-check ke halaman
-- Reimburse aslinya).
CREATE TABLE pengajuan_dana_item (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pengajuan_id INT NOT NULL,
  kategori_id INT NULL,
  keterangan VARCHAR(255) NOT NULL,
  nominal BIGINT NOT NULL DEFAULT 0,
  urutan INT NOT NULL DEFAULT 0,
  sumber ENUM('manual','reimburse') NOT NULL DEFAULT 'manual',
  reimburse_id INT NULL,
  FOREIGN KEY (pengajuan_id) REFERENCES pengajuan_dana(id) ON DELETE CASCADE,
  FOREIGN KEY (kategori_id) REFERENCES cashflow_kategori(id),
  FOREIGN KEY (reimburse_id) REFERENCES cashflow_reimburse(id)
);
