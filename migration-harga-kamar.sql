-- ============================================
-- MIGRATION: harga & ujroh per tipe kamar (programs)
-- 3 paket (deluxe/eksekutif/signature) x 3 kamar (quad/triple/double)
-- Jalankan sekali di MySQL, database: jm_travel
-- ============================================

-- 1) Tambah kolom harga & ujroh per kamar
ALTER TABLE programs
  ADD COLUMN harga_deluxe_quad      BIGINT AFTER harga_signature,
  ADD COLUMN harga_deluxe_triple    BIGINT AFTER harga_deluxe_quad,
  ADD COLUMN harga_deluxe_double    BIGINT AFTER harga_deluxe_triple,
  ADD COLUMN harga_eksekutif_quad   BIGINT AFTER harga_deluxe_double,
  ADD COLUMN harga_eksekutif_triple BIGINT AFTER harga_eksekutif_quad,
  ADD COLUMN harga_eksekutif_double BIGINT AFTER harga_eksekutif_triple,
  ADD COLUMN harga_signature_quad   BIGINT AFTER harga_eksekutif_double,
  ADD COLUMN harga_signature_triple BIGINT AFTER harga_signature_quad,
  ADD COLUMN harga_signature_double BIGINT AFTER harga_signature_triple,
  ADD COLUMN ujroh_deluxe_quad      BIGINT AFTER ujroh_signature,
  ADD COLUMN ujroh_deluxe_triple    BIGINT AFTER ujroh_deluxe_quad,
  ADD COLUMN ujroh_deluxe_double    BIGINT AFTER ujroh_deluxe_triple,
  ADD COLUMN ujroh_eksekutif_quad   BIGINT AFTER ujroh_deluxe_double,
  ADD COLUMN ujroh_eksekutif_triple BIGINT AFTER ujroh_eksekutif_quad,
  ADD COLUMN ujroh_eksekutif_double BIGINT AFTER ujroh_eksekutif_triple,
  ADD COLUMN ujroh_signature_quad   BIGINT AFTER ujroh_eksekutif_double,
  ADD COLUMN ujroh_signature_triple BIGINT AFTER ujroh_signature_quad,
  ADD COLUMN ujroh_signature_double BIGINT AFTER ujroh_signature_triple;

-- 2) Isi cepat untuk program yang sudah ada
--    Patokan: harga lama = harga TRIPLE. Quad lebih murah, Double lebih mahal.
--    GANTI selisih 2jt / 3jt sesuai kebijakan JM Travel.
UPDATE programs SET
  harga_deluxe_triple    = harga_deluxe,
  harga_deluxe_quad      = harga_deluxe - 2000000,
  harga_deluxe_double    = harga_deluxe + 3000000,
  harga_eksekutif_triple = harga_eksekutif,
  harga_eksekutif_quad   = harga_eksekutif - 2000000,
  harga_eksekutif_double = harga_eksekutif + 3000000,
  harga_signature_triple = harga_signature,
  harga_signature_quad   = harga_signature - 2000000,
  harga_signature_double = harga_signature + 3000000,
  ujroh_deluxe_triple    = ujroh_deluxe,
  ujroh_deluxe_quad      = ujroh_deluxe,
  ujroh_deluxe_double    = ujroh_deluxe,
  ujroh_eksekutif_triple = ujroh_eksekutif,
  ujroh_eksekutif_quad   = ujroh_eksekutif,
  ujroh_eksekutif_double = ujroh_eksekutif,
  ujroh_signature_triple = ujroh_signature,
  ujroh_signature_quad   = ujroh_signature,
  ujroh_signature_double = ujroh_signature;
