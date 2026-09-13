-- ============================================
-- MIGRATION: Kurs Master (Kalkulator Estimasi Publik)
--
-- Kurs SAR/USD -> IDR buat Kalkulator Estimasi Publik (kurasi & Kalkulator
-- Acuan) sekarang narik dari SINI (1 baris global, sama pola kayak field
-- pengaturan lain di tabel `pengaturan`) — bukan lagi dari kurs yang
-- kesimpen per-template. Kalkulator publik sifatnya estimasi & bisa
-- berubah seiring waktu, jadi begitu kurs di sini diubah admin, SEMUA
-- template publik otomatis ikut kepakai kurs baru pas jamaah hitung
-- (dikonfirmasi user 2026-08-18).
--
-- Costing Program internal (program-costing/form Program) TIDAK kepengaruh
-- migrasi ini — kurs di situ tetap manual per-program & terkunci selamanya
-- begitu program dibuat (gak auto-update), karena itu emang harga yang
-- udah di-lock, bukan estimasi.
--
-- Jalankan sekali di MySQL, database: jm_travel
-- ============================================

ALTER TABLE pengaturan
  ADD COLUMN kurs_sar_idr DECIMAL(10,2) NULL AFTER fb_url,
  ADD COLUMN kurs_usd_idr DECIMAL(10,2) NULL AFTER kurs_sar_idr;

UPDATE pengaturan SET kurs_sar_idr = 5000, kurs_usd_idr = 18000 WHERE id = 1 AND kurs_sar_idr IS NULL;
