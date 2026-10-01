-- Frekuensi eksplisit per item biaya (dikonfirmasi user 2026-10-01) —
-- sebelumnya SATU-SATUNYA cara bikin item kekali Total Hari Program itu
-- akhiran nama "/Day"/"/Hari" (lihat itemPerHari() di src/lib/kalkulatorBiaya.js),
-- gak ada kontrol eksplisit buat admin, dan gak ada opsi serupa buat item
-- lain (mis. city tour per-malam).
--
-- NULL (default) = fallback ke heuristik nama lama (itemPerHari) — item
-- EXISTING gak berubah perilakunya sama sekali. 'flat'/'per_hari' = override
-- eksplisit, menang di atas nama apa pun.
ALTER TABLE biaya_master_item ADD COLUMN frekuensi ENUM('flat','per_hari') NULL;
ALTER TABLE biaya_breakdown_item ADD COLUMN frekuensi ENUM('flat','per_hari') NULL;
