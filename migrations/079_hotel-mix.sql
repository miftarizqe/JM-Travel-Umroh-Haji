-- Hotel per paket bisa "Fix" (2 slot tetap kayak sebelumnya — cocok buat
-- Umroh yang selalu Mekkah+Madinah) atau "Mix" (daftar hotel bebas jumlah &
-- kombinasi kota/negara/bintang — buat Wisata atau Umroh yang hotelnya
-- kebetulan mixed). Default 'fix' biar data lama gak berubah perilaku.
ALTER TABLE biaya_breakdown
  ADD COLUMN hotel_mode VARCHAR(10) NOT NULL DEFAULT 'fix' AFTER paket,
  ADD COLUMN hotel_list JSON NULL AFTER hotel_madinah_mata_uang;
