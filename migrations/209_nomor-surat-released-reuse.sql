-- Reuse nomor surat yang "kebakar" tapi gak kepake (pendaftaran ditolak) --
-- dikonfirmasi user 2026-10-03: nomor SPK-AK/SK-CIF/Surat Pemblokiran
-- dibekukan begitu jamaah pertama buka halaman baca dokumen, JAUH sebelum
-- admin putuskan terima/tolak. Kalau ditolak, nomor itu dirilis ke sini dan
-- dipakai ulang jamaah BERIKUTNYA yang daftar bulan sama (lihat
-- src/lib/nomorSurat.js). Beda bulan -> gak dirilis, dibiarin jadi gap
-- (lumrah, kayak nomor invoice yang di-void -- auditable lewat
-- pendaftaran_status_log, bukan masalah).
CREATE TABLE IF NOT EXISTS nomor_surat_released (
  id INT AUTO_INCREMENT PRIMARY KEY,
  jenis VARCHAR(20) NOT NULL,
  bulan TINYINT NOT NULL,
  tahun SMALLINT NOT NULL,
  urutan INT NOT NULL,
  nomor VARCHAR(100) NOT NULL,
  released_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ambil (jenis, bulan, tahun, urutan)
);
