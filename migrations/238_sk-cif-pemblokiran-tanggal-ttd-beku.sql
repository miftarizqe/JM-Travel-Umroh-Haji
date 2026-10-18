-- Tanggal TTD di dokumen SK-CIF & Surat Pemblokiran dibekukan PERMANEN dari
-- users.setuju_pks_at (dikonfirmasi user 2026-10-18), samain pola SPK-AK/
-- SPKA-Ins (lihat migration 220/221, src/lib/nomorSurat.js
-- ambilAtauBuatTanggalBeku) -- sebelumnya dihitung `new Date()` setiap PDF
-- digenerate ulang (lihat dokumenSahabatGabungan.js), beda dari dokumen
-- lain yang udah dibekukan sejak tanggal setuju.
ALTER TABLE users
  ADD COLUMN tgl_sk_cif DATE NULL AFTER no_sk_cif,
  ADD COLUMN tgl_surat_pemblokiran DATE NULL AFTER no_surat_pemblokiran;
