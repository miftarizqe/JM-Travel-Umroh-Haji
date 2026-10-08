-- 2 kebutuhan baru di flow "Metode TTD & Kirim Dokumen" sahabat
-- (dikonfirmasi user 2026-10-08):
-- 1. Checklist "diterima di kantor" selama ini cuma 3 dokumen (SPK-AK,
--    SK-CIF, Pemblokiran) -- jamaah yang juga butuh bantuan BSI manual
--    (bantuan_bsi_manual_disetujui_at) sebenarnya kirim 4 dokumen fisik
--    (+ Formulir Pendaftaran Rekening BSI), tapi gak ada kolom buat
--    nandain dokumen ke-4 itu diterima.
-- 2. Jamaah gak punya cara self-report "saya sudah kirim" -- sebelumnya
--    cuma ada status "diterima" (dicentang admin), gak ada status antara
--    "udah dikirim, masih di jalan".
ALTER TABLE users
  ADD COLUMN dokumen_formulir_bsi_fisik_diterima_at DATETIME NULL AFTER dokumen_spk_ak_fisik_diterima_at,
  ADD COLUMN dokumen_fisik_dikirim_at DATETIME NULL AFTER dokumen_spk_ak_dikirim_balik_at,
  ADD COLUMN dokumen_fisik_resi VARCHAR(100) NULL AFTER dokumen_fisik_dikirim_at;
