-- Fitur "Tambah Jamaah" ke booking yang sudah ada (dikonfirmasi user
-- 2026-10-13): jamaah bisa nambah pax ke booking aktifnya sendiri selama DP
-- booking itu udah confirmed & seat program masih cukup, pax baru wajib
-- bayar DP sendiri (prog.dp per orang, payment row baru type='dp').
--
-- Ini bikin potongKuotaSeatDp (src/lib/booking.js) BISA dipanggil lebih dari
-- sekali per booking (pertama kali pas DP awal confirmed, lagi pas DP pax
-- tambahan confirmed) -- versi lama nambahin FULL jumlah_jamaah tiap
-- dipanggil, bakal DOBEL-HITUNG seat orang yang DP-nya udah pernah
-- dikonfirmasi sebelumnya. seat_dipotong nyimpen berapa seat yang BENERAN
-- udah ditambahin ke programs.used_seat buat booking ini -- potongKuotaSeatDp
-- jadi hitung selisih (jumlah_jamaah - seat_dipotong), bukan jumlah_jamaah
-- mentah.
ALTER TABLE bookings
  ADD COLUMN seat_dipotong INT NOT NULL DEFAULT 0 AFTER jumlah_jamaah;

-- Backfill: booking yang DP-nya udah confirmed berarti seat-nya udah
-- kepotong penuh sejumlah jumlah_jamaah (satu-satunya jalur lama).
UPDATE bookings SET seat_dipotong = jumlah_jamaah WHERE dp_status = 'confirmed';
