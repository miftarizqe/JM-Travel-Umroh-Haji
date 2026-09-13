-- ============================================================
-- MIGRATION — Skema Reseller Berjenjang Perwakilan
-- Jalankan sekali di MySQL, database: jm_travel
--
-- Model bisnis:
--   - Perwakilan direkrut perwakilan lain (perekrut_id -> role perwakilan):
--     HPP downline = harga reseller yang dipasang upline (perwakilan_harga),
--     bukan HPP kantor. Berjenjang natural per-hop.
--   - Perwakilan direkrut agen (perekrut_id -> role agen):
--     HPP perwakilan TETAP dari kantor (tidak berubah). Agen memasang
--     harga reseller sendiri (agen_harga_reseller); marginnya = harga
--     reseller agen - HPP kantor, dibayar ke agen tsb SAJA (tidak
--     berjenjang ke atasan agen).
--   - Downline diblokir closing kalau perekrut langsungnya belum
--     memasang harga reseller untuk kombinasi program+paket+kamar itu.
--   - Margin dicatat ke komisi_ledger (jenis baru) saat booking-selesai.
-- ============================================================

-- 1) Tambah jenis baru ke komisi_ledger untuk margin reseller
ALTER TABLE komisi_ledger
  MODIFY jenis ENUM(
    'closing_pribadi','closing_bsi',
    'override_l1','override_l2','override_l3',
    'leader','leader_override_l1','leader_override_l2','leader_override_l3',
    'reseller_perwakilan','reseller_agen'
  ) NOT NULL;

-- 2) Tabel harga reseller agen -> perwakilan yang mereka rekrut
--    Struktur sama dengan perwakilan_harga (9 kombinasi paket x kamar).
CREATE TABLE IF NOT EXISTS agen_harga_reseller (
  id INT AUTO_INCREMENT PRIMARY KEY,
  agen_id VARCHAR(36) NOT NULL,
  prog_id VARCHAR(36) NOT NULL,
  jual_deluxe_quad BIGINT DEFAULT 0,
  jual_deluxe_triple BIGINT DEFAULT 0,
  jual_deluxe_double BIGINT DEFAULT 0,
  jual_eksekutif_quad BIGINT DEFAULT 0,
  jual_eksekutif_triple BIGINT DEFAULT 0,
  jual_eksekutif_double BIGINT DEFAULT 0,
  jual_signature_quad BIGINT DEFAULT 0,
  jual_signature_triple BIGINT DEFAULT 0,
  jual_signature_double BIGINT DEFAULT 0,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_agen_prog (agen_id, prog_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
