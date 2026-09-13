-- ============================================
-- MIGRATION: tabel perwakilan_harga
-- Menyimpan harga jual perwakilan per program, per paket x kamar (9 kombinasi)
-- HPP tetap dari programs.hpp_perw (ditetapkan admin).
-- Jalankan sekali di MySQL, database: jm_travel
-- ============================================

CREATE TABLE IF NOT EXISTS perwakilan_harga (
  id INT AUTO_INCREMENT PRIMARY KEY,
  perw_id VARCHAR(36) NOT NULL,
  prog_id VARCHAR(36) NOT NULL,

  jual_deluxe_quad      BIGINT DEFAULT 0,
  jual_deluxe_triple    BIGINT DEFAULT 0,
  jual_deluxe_double    BIGINT DEFAULT 0,
  jual_eksekutif_quad   BIGINT DEFAULT 0,
  jual_eksekutif_triple BIGINT DEFAULT 0,
  jual_eksekutif_double BIGINT DEFAULT 0,
  jual_signature_quad   BIGINT DEFAULT 0,
  jual_signature_triple BIGINT DEFAULT 0,
  jual_signature_double BIGINT DEFAULT 0,

  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_perw_prog (perw_id, prog_id)
);
