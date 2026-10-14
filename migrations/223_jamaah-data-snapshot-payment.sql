-- Tanda Terima Uang/Invoice buat 1 payment DP spesifik salah nampilin qty &
-- "Atas Nama Jamaah" (dikonfirmasi user 2026-10-14) -- karena render-nya
-- selama ini narik booking.jamaah_data LIVE (jumlah jamaah TERKINI), bukan
-- snapshot jamaah yang BENERAN ditutup sama payment itu. Begitu ada "Tambah
-- Jamaah" (DP kedua buat pax baru), TTU buat DP itu malah ikut ngitung
-- jamaah yang DP-nya SUDAH confirmed duluan di payment lain.
--
-- jamaah_data_snapshot: array jamaah_data (nama/paket/kamar/harga_jual)
-- yang BENERAN ditutup payment ini, dibekukan pas payment dibuat (lihat
-- buatSatuBooking & tambahJamaahKeBooking di src/lib/booking.js) --
-- immutable, gak pernah diubah lagi sesudahnya. NULL buat payment lama
-- (sebelum migrasi ini) & payment type='lunas' (pelunasan tetap pakai
-- jamaah_data booking TERKINI, karena emang nutup SEMUA jamaah aktif saat itu).
ALTER TABLE payments
  ADD COLUMN jamaah_data_snapshot JSON NULL AFTER bukti_nama;
