-- SPK-AK/SK-CIF/Surat Pemblokiran Sahabat Baitullah: TTD fisik manual
-- SEMENTARA (vendor esign/e-materai belum siap connect buat launch
-- 2026-10-01, dikonfirmasi user 2026-09-30 — lihat src/lib/spkAkFlag.js).
--
-- Jamaah pilih SATU dari dua cara buat TTD ketiga dokumen (SPK-AK, SK-CIF,
-- Surat Pemblokiran):
--  - 'kantor': datang langsung ke Head Office, TTD ketiganya di tempat.
--    Materai SK-CIF & Surat Pemblokiran dibawa jamaah sendiri (2 materai),
--    materai SPK-AK disediakan kantor (dikonfirmasi user).
--  - 'kirim': cetak sendiri, TTD di atas materai asli, scan, unggah, kirim
--    fisik ke kantor lewat pos/kurir (pola SAMA yang sudah ada buat SK-CIF/
--    Surat Pemblokiran; SPK-AK ikut pola sama lewat halaman
--    /admin/cetak-spk-ak yang sudah dibangun sebelum jalur digital ada).
ALTER TABLE users
  ADD COLUMN metode_ttd_sahabat ENUM('kantor','kirim') NULL,
  ADD COLUMN rencana_kunjungan_kantor_at DATE NULL,
  -- SPK-AK 2 rangkap (materai silang) — begitu jamaah kirim fisik ke kantor,
  -- kantor TTD sisi Pihak Pertama, tempel materai, lalu kirim BALIK 1
  -- rangkap ke jamaah. Ini nandain kapan pengiriman balik itu terjadi.
  ADD COLUMN dokumen_spk_ak_dikirim_balik_at DATETIME NULL;
