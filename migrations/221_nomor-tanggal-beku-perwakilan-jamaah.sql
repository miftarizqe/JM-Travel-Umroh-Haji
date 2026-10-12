-- Samain pola nomor+tanggal beku (lihat migration 220, SPK-AK Sahabat
-- Baitullah) ke SPKA-Ins (Perwakilan) & Perjanjian Jamaah (dikonfirmasi
-- user 2026-10-12).
--
-- SPKA-Ins: nomor udah beku dari dulu (no_perjanjian_kerjasama), tapi
-- tanggal di teks "Pada hari X, tanggal Y" masih ambil dari users.created_at
-- (tanggal akun dibuat) -- bisa beda bulan dari nomor (nomor beku pas
-- dokumen PERTAMA dicetak, bukan pas akun dibuat). Disamain: tanggal ikut
-- beku pas dokumen pertama disentuh, sama kayak nomor.
ALTER TABLE users
  ADD COLUMN tgl_perjanjian_kerjasama DATE NULL AFTER no_perjanjian_kerjasama;

-- Perjanjian Jamaah (per BOOKING, bukan per akun -- 1 jamaah bisa booking
-- berkali-kali): sebelumnya GAK PUNYA nomor surat resmi sama sekali,
-- halaman cetak cuma nampilin booking.id mentah sebagai placeholder.
-- Tanggal udah beku dari dulu (bookings.created_at, gak pernah berubah),
-- gak butuh kolom baru buat itu.
ALTER TABLE bookings
  ADD COLUMN no_perjanjian_jamaah VARCHAR(30) NULL;
