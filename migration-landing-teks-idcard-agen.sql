USE jm_travel;

-- Tambah "ID Card resmi" sebagai benefit yang ditonjolkan (keputusan user,
-- 2026-08-03) — sekaligus ngimbangin syarat setoran Rp1jt yang baru masuk
-- (lihat migration-landing-teks-deposit-agen.sql).
UPDATE landing_page_teks
  SET nilai = 'Setoran awal Rp1.000.000 (jadi tabungan umrohmu)\nUjroh per closing\nTabungan Umroh BSI\nSistem poin Tour Leader\nID Card resmi Agen JM Travel'
  WHERE kunci = 'kemitraan_agen_items';

UPDATE landing_page_teks
  SET nilai = 'Setoran awal Rp1.000.000 ke Tabungan BSI (jadi modal umrohmu sendiri)\nUjroh setiap jamaah yang berangkat\nOverride berjenjang dari tim yang kamu ajak\nPoin Tour Leader → jalan menuju umroh gratis\nDifasilitasi ID Card resmi Agen JM Travel'
  WHERE kunci = 'kemitraan_modal_agen_benefit';
