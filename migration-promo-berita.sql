USE jm_travel;

-- Promo banner diperkaya: deskripsi/S&K, flyer promo (gambar), dan kode
-- voucher yang bisa di-copy langsung dari modal detail di landing page.
ALTER TABLE promo_banner
  ADD COLUMN deskripsi TEXT AFTER judul,
  ADD COLUMN flyer_path VARCHAR(255) AFTER deskripsi,
  ADD COLUMN kode_voucher VARCHAR(50) AFTER flyer_path;

-- Berita & Kegiatan — feed kronologis (bukan grid foto polos lagi), isinya
-- bisa recap kegiatan LAMA atau pengumuman event AKAN DATANG. Status
-- "Akan Datang" vs "Sudah Berlangsung" DIHITUNG dari tanggal, gak disimpan
-- manual (gak bakal ketinggalan update).
CREATE TABLE IF NOT EXISTS berita_kegiatan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  judul VARCHAR(200) NOT NULL,
  deskripsi TEXT,
  tanggal DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Foto kegiatan sekarang ditautkan ke berita_id (bukan dikelompokkan lewat
-- batch_judul kayak sebelumnya) — 1 berita bisa punya banyak foto.
ALTER TABLE galeri_foto
  ADD COLUMN berita_id INT NULL AFTER tipe,
  ADD INDEX idx_berita (berita_id);
