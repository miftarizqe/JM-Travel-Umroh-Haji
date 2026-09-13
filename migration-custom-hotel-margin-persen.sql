-- Custom Hotel per Kota (checkout program reguler) + margin/komisi persentase
-- dari HPP — KHUSUS jalur custom-hotel ini, paket Deluxe/Eksekutif/Signature
-- yang sudah ada tetap pakai margin_rate/komisi_rate flat Rp seperti biasa
-- (dikonfirmasi user 2026-08-19, lihat plan "purring-swimming-wave").
--
-- hotel_{mekkah,madinah}_opsi: array JSON opsi hotel per kota, struktur SAMA
-- persis dengan mekanisme kombinasi-hotel yang sudah ada di kalkulator
-- publik: [{ nama, rate_double, rate_triple, rate_quad, mata_uang,
-- master_id, bintang }] — diisi admin lewat checklist Master Hotel di
-- KalkulatorTerpadu.jsx, di-baked dari biaya_breakdown (template) ke
-- programs (row aktif) persis kayak hpp_*/harga_* sekarang.
--
-- Default 'flat' + kolom baru semua nullable -> nol dampak ke
-- template/program yang sudah ada.
ALTER TABLE biaya_breakdown
  ADD COLUMN hotel_mekkah_opsi JSON NULL AFTER margin_rate,
  ADD COLUMN hotel_madinah_opsi JSON NULL AFTER hotel_mekkah_opsi,
  ADD COLUMN margin_mode ENUM('flat','persen') NOT NULL DEFAULT 'flat' AFTER hotel_madinah_opsi,
  ADD COLUMN margin_persen DECIMAL(6,3) NULL AFTER margin_mode,
  ADD COLUMN komisi_mode ENUM('flat','persen') NOT NULL DEFAULT 'flat' AFTER margin_persen,
  ADD COLUMN komisi_persen DECIMAL(6,3) NULL AFTER komisi_mode;

ALTER TABLE programs
  ADD COLUMN hotel_mekkah_opsi JSON NULL,
  ADD COLUMN hotel_madinah_opsi JSON NULL,
  ADD COLUMN margin_mode ENUM('flat','persen') NOT NULL DEFAULT 'flat',
  ADD COLUMN margin_persen DECIMAL(6,3) NULL,
  ADD COLUMN komisi_mode ENUM('flat','persen') NOT NULL DEFAULT 'flat',
  ADD COLUMN komisi_persen DECIMAL(6,3) NULL;
