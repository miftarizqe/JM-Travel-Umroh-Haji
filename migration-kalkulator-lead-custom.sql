-- ============================================
-- MIGRATION: Ajukan Custom Sendiri di Kalkulator Estimasi Publik
--
-- Fallback buat pengunjung yang gak nemu template yang cocok — bisa ajukan
-- permintaan custom (deskripsi bebas + tanggal + jumlah pax) TANPA perlu
-- pilih template/paket/kamar dari katalog, langsung jadi lead status
-- 'diajukan' (gak ada tahap 'estimasi' krn emang gak ada harga yang
-- dihitung otomatis — admin yang quote manual).
--
-- kalkulator_lead.template_id/paket/kamar/harga_jual jadi NULLABLE (dulu
-- NOT NULL, cuma relevan buat lead dari template) — `tipe` yang nentuin
-- baris ini lead dari template atau custom sendiri.
--
-- Jalankan sekali di MySQL, database: jm_travel
-- ============================================

ALTER TABLE kalkulator_lead
  MODIFY COLUMN template_id VARCHAR(36) NULL,
  MODIFY COLUMN paket VARCHAR(30) NULL,
  MODIFY COLUMN kamar VARCHAR(30) NULL,
  MODIFY COLUMN harga_jual BIGINT NULL,
  ADD COLUMN tipe ENUM('template','custom') NOT NULL DEFAULT 'template' AFTER template_id,
  ADD COLUMN catatan_custom TEXT NULL AFTER addon_config,
  ADD COLUMN jumlah_pax INT NULL AFTER catatan_custom;
