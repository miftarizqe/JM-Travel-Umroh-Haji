-- ============================================
-- MIGRATION: HPP per paket x kamar (9 kombinasi) di tabel programs
-- Sebelumnya HPP cuma 1 kolom (hpp_perw). Sekarang 9 kolom.
-- Jalankan sekali di MySQL, database: jm_travel
-- ============================================

ALTER TABLE programs
  ADD COLUMN hpp_deluxe_quad      BIGINT DEFAULT 0 AFTER hpp_perw,
  ADD COLUMN hpp_deluxe_triple    BIGINT DEFAULT 0 AFTER hpp_deluxe_quad,
  ADD COLUMN hpp_deluxe_double    BIGINT DEFAULT 0 AFTER hpp_deluxe_triple,
  ADD COLUMN hpp_eksekutif_quad   BIGINT DEFAULT 0 AFTER hpp_deluxe_double,
  ADD COLUMN hpp_eksekutif_triple BIGINT DEFAULT 0 AFTER hpp_eksekutif_quad,
  ADD COLUMN hpp_eksekutif_double BIGINT DEFAULT 0 AFTER hpp_eksekutif_triple,
  ADD COLUMN hpp_signature_quad   BIGINT DEFAULT 0 AFTER hpp_eksekutif_double,
  ADD COLUMN hpp_signature_triple BIGINT DEFAULT 0 AFTER hpp_signature_quad,
  ADD COLUMN hpp_signature_double BIGINT DEFAULT 0 AFTER hpp_signature_triple;

-- Isi awal: kalau sudah ada hpp_perw lama, pakai itu sebagai nilai awal semua kombinasi
-- (nanti admin sesuaikan angka tiap kombinasi). Aman kalau hpp_perw NULL -> jadi 0.
UPDATE programs SET
  hpp_deluxe_quad      = COALESCE(hpp_perw, 0),
  hpp_deluxe_triple    = COALESCE(hpp_perw, 0),
  hpp_deluxe_double    = COALESCE(hpp_perw, 0),
  hpp_eksekutif_quad   = COALESCE(hpp_perw, 0),
  hpp_eksekutif_triple = COALESCE(hpp_perw, 0),
  hpp_eksekutif_double = COALESCE(hpp_perw, 0),
  hpp_signature_quad   = COALESCE(hpp_perw, 0),
  hpp_signature_triple = COALESCE(hpp_perw, 0),
  hpp_signature_double = COALESCE(hpp_perw, 0);
