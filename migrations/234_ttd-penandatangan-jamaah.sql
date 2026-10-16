-- TTD digital Pihak Pertama (JM Travel) khusus SPJ (Perjanjian Jamaah) —
-- disamain polanya dengan Invoice/Kwitansi/TTU (lihat
-- ttd_penandatangan_keuangan_path di migration 108), dikonfirmasi user
-- 2026-10-16. Cap Perusahaan REUSE cap_perusahaan_path yang udah ada
-- (stempel fisik sama buat semua dokumen, gak perlu kolom baru).
ALTER TABLE pengaturan
  ADD COLUMN ttd_penandatangan_jamaah_path VARCHAR(255) NULL;
