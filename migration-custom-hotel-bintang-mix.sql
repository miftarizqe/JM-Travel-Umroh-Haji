-- Custom Hotel per Kota didesain ULANG (dikonfirmasi user 2026-08-20):
-- BUKAN checklist hotel spesifik dari Master Hotel (hotel_mekkah_opsi/
-- hotel_madinah_opsi, migration-custom-hotel-margin-persen.sql) — ternyata
-- gak perlu, cukup reuse 3 baris paket (Deluxe/Eksekutif/Signature =
-- Bintang 3/4/5) yang SUDAH ADA. Jamaah pilih Bintang Mekkah & Madinah
-- SECARA TERPISAH, harga dihitung proporsional dari rate hotel per-kota
-- baris paket yang bersangkutan (lihat src/lib/hotelCustomPricing.js) — 3
-- paket tetap TIDAK berubah sama sekali, ini murni tambahan opsi.
ALTER TABLE biaya_breakdown
  DROP COLUMN hotel_mekkah_opsi,
  DROP COLUMN hotel_madinah_opsi;

ALTER TABLE programs
  DROP COLUMN hotel_mekkah_opsi,
  DROP COLUMN hotel_madinah_opsi;
