-- Tanggal TTD di dokumen SPK-AK / SPK-AK Non-Muslim dibekukan PERMANEN
-- bareng nomor surat (dikonfirmasi user 2026-10-12) -- sebelumnya
-- dihitung ulang `new Date()` setiap dokumen dibuka/dicetak ulang, bikin
-- tanggal di surat ikut maju walau nomornya udah beku dari kapan (lihat
-- src/lib/nomorSurat.js ambilAtauBuatTanggalBeku).
ALTER TABLE users
  ADD COLUMN tgl_spk_ak DATE NULL AFTER no_spk_ak,
  ADD COLUMN tgl_spk_ak_nonis DATE NULL AFTER no_spk_ak_nonis;
