USE jm_travel;

-- Tambah tipe 'kegiatan' buat foto pelatihan/booth/event agen-perwakilan —
-- ditampilin gaya "mading" (rekam jejak) di section Kemitraan landing page.
-- 'instagram' dibiarin di enum (data lama gak divalidasi ulang) walau
-- fiturnya udah gak dipakai lagi sejak SnapWidget live feed.
ALTER TABLE galeri_foto
  MODIFY tipe ENUM('keberangkatan','instagram','kegiatan') NOT NULL DEFAULT 'keberangkatan';

-- Banner promo/event publik — dismissible di landing page. Bisa lebih dari
-- 1 baris (riwayat), tapi cuma yang aktif=1 PALING BARU yang ditampilkan.
CREATE TABLE IF NOT EXISTS promo_banner (
  id INT AUTO_INCREMENT PRIMARY KEY,
  judul VARCHAR(200) NOT NULL,
  link VARCHAR(255),
  link_label VARCHAR(50),
  aktif TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
