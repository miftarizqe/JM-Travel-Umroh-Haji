USE jm_travel;

ALTER TABLE perlengkapan_jamaah ADD COLUMN gambar VARCHAR(255) NULL;

-- Foto asli JM Travel (dari materi promosi), dikelompokkan sesuai kiriman:
-- koper+tag+ransel, detail personal (slayer/paspor/idcard), ibadah
-- (ihrom-mukena+buku doa), seragam+bantal leher.
UPDATE perlengkapan_jamaah SET gambar = '/images/perlengkapan-koper-tas.jpg'
  WHERE nama IN ('Koper Bagasi 23 inch', 'Tag Koper (3 pcs)', 'Tas Ransel 3in1');
UPDATE perlengkapan_jamaah SET gambar = '/images/perlengkapan-detail-personal.jpg'
  WHERE nama IN ('Slayer', 'Cover Paspor', 'ID Card Siskopatuh');
UPDATE perlengkapan_jamaah SET gambar = '/images/perlengkapan-ibadah.jpg'
  WHERE nama IN ('Kain Ihrom / Mukena', 'Buku Doa');
UPDATE perlengkapan_jamaah SET gambar = '/images/perlengkapan-seragam-bantal.jpg'
  WHERE nama IN ('Kain Seragam', 'Bantal Leher');
