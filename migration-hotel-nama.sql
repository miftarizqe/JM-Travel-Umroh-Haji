USE jm_travel;

-- Nama hotel Mekkah & Madinah beda per paket (Deluxe/Eksekutif/Signature) —
-- wajar krn tiap paket emang udah beda bintang hotel (3/4/5), jadi hotelnya
-- juga beda, bukan cuma tipe kamar.
ALTER TABLE programs
  ADD COLUMN hotel_mekkah_deluxe VARCHAR(150) AFTER harga_deluxe_double,
  ADD COLUMN hotel_madinah_deluxe VARCHAR(150) AFTER hotel_mekkah_deluxe,
  ADD COLUMN hotel_mekkah_eksekutif VARCHAR(150) AFTER harga_eksekutif_double,
  ADD COLUMN hotel_madinah_eksekutif VARCHAR(150) AFTER hotel_mekkah_eksekutif,
  ADD COLUMN hotel_mekkah_signature VARCHAR(150) AFTER harga_signature_double,
  ADD COLUMN hotel_madinah_signature VARCHAR(150) AFTER hotel_mekkah_signature;
