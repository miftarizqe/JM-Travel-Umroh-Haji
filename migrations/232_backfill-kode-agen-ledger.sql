-- Baris ledger Gen1-5/operasional yang dicatat sebelum fix 2026-10-15 telanjur
-- nyimpen "(Kode Agen: -)" — kode_unik pendaftar baru dijatah di request yang
-- sama tapi nilainya belum kebaca. Isi ulang dari kode_unik yang sekarang
-- sudah ada di users (ref_id = user pendaftar buat jenis-jenis ini).
UPDATE komisi_ledger kl
JOIN users u ON u.id = kl.ref_id
SET kl.keterangan = REPLACE(kl.keterangan, '(Kode Agen: -)', CONCAT('(Kode Agen: ', u.kode_unik, ')'))
WHERE kl.jenis IN ('komisi_sahabat', 'operasional_sahabat')
  AND kl.keterangan LIKE '%(Kode Agen: -)%'
  AND u.kode_unik IS NOT NULL;
