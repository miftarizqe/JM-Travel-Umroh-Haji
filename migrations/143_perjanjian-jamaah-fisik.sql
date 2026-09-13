-- Perjanjian Jamaah sekarang jadi step wajib tersendiri (bukan cuma centang
-- checkbox) sebelum jamaah bisa lanjut pelunasan — materai jadi wajib (lihat
-- perubahan apakahPerluMaterai('jamaah') di src/lib/materaiRule.js), jamaah
-- boleh pilih jalur digital (materai mock otomatis via dokumen_signature yang
-- sudah ada) atau fisik (dicetak + materai asli + TTD di kantor). Kolom di
-- sini nampung jalur fisik, pola sama persis scan_fisik_path di
-- invoice_kwitansi.
--
-- Jalankan: mysql -u root -p jm_travel < migration-perjanjian-jamaah-fisik.sql
ALTER TABLE bookings
  ADD COLUMN perjanjian_scan_path VARCHAR(255) NULL,
  ADD COLUMN perjanjian_scan_uploaded_at TIMESTAMP NULL;
