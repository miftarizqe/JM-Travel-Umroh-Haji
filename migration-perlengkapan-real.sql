USE jm_travel;

-- Ganti isi placeholder (kosong) dengan daftar perlengkapan jamaah yang
-- SEBENARNYA dikirim JM Travel.
DELETE FROM perlengkapan_jamaah;

INSERT INTO perlengkapan_jamaah (urutan, nama) VALUES
(1, 'Koper Bagasi 23 inch'),
(2, 'Tag Koper (3 pcs)'),
(3, 'Slayer'),
(4, 'Cover Paspor'),
(5, 'ID Card Siskopatuh'),
(6, 'Kain Ihrom / Mukena'),
(7, 'Buku Doa'),
(8, 'Tas Ransel 3in1'),
(9, 'Kain Seragam'),
(10, 'Bantal Leher');
