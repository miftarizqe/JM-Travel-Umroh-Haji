-- Revert migration-nama-jamaah-booking.sql — nama jamaah ternyata disimpan
-- per-orang lewat jamaah_data (seed dari CartPaketKamar), bukan 1 kolom
-- teks tunggal per booking. Kolom ini sudah tidak dipakai kode manapun.
ALTER TABLE bookings
  DROP COLUMN nama_jamaah;
