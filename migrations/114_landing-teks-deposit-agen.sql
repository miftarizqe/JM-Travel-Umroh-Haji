USE jm_travel;

-- Teks landing "Daftar gratis, tanpa modal" jadi salah sejak Memo 00014/JM-IM/07.26
-- (efektif 1 Agustus 2026) mewajibkan setoran awal Rp1.000.000 buat agen baru
-- (lihat migration-deposit-agen.sql). Reframing: setoran itu bukan cuma biaya,
-- tapi cikal-bakal tabungan umroh pribadi agen — sama seperti disebutkan di
-- poin 4 memo.
UPDATE landing_page_teks
  SET nilai = 'Setoran awal Rp1.000.000 (jadi tabungan umrohmu)\nUjroh per closing\nTabungan Umroh BSI\nSistem poin Tour Leader'
  WHERE kunci = 'kemitraan_agen_items';

UPDATE landing_page_teks
  SET nilai = 'Setoran awal Rp1.000.000 ke Tabungan BSI (jadi modal umrohmu sendiri)\nUjroh setiap jamaah yang berangkat\nOverride berjenjang dari tim yang kamu ajak\nPoin Tour Leader → jalan menuju umroh gratis'
  WHERE kunci = 'kemitraan_modal_agen_benefit';
