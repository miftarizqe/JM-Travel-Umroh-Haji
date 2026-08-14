USE jm_travel;

-- Foto dokumentasi keberangkatan buat landing page (slideshow per batch).
-- batch_judul dikelompokkan di level aplikasi, bukan tabel master terpisah
-- — cukup buat kebutuhan galeri, gak perlu relasi ke tabel programs krn
-- keberangkatan lama bisa aja programnya udah gak ada/berubah.
CREATE TABLE IF NOT EXISTS galeri_foto (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_judul VARCHAR(150) NOT NULL,
  batch_tanggal DATE,
  foto_path VARCHAR(255) NOT NULL,
  -- 'instagram' = konten slideshow IG di section Dokumentasi (flat, gak
  -- dikelompokkan per batch di tampilan publik), 'keberangkatan' = galeri
  -- per keberangkatan seperti semula.
  tipe ENUM('keberangkatan','instagram') NOT NULL DEFAULT 'keberangkatan',
  urutan INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_batch (batch_judul, urutan)
);
