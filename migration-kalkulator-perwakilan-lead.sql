-- Kalkulator Perwakilan — perwakilan eksplorasi harga sendiri (rute/hotel/
-- malam/mutawwif/kamar, mesin sama persis Kalkulator Estimasi Publik) tapi
-- berhenti di HPP murni (margin_rate=0) lalu isi margin/ujroh sendiri. Bisa
-- disave (draft) buat ditawarkan ke jamaah, dan bisa diajukan ke admin buat
-- dipertimbangkan jadi program resmi — TIDAK auto-publish, admin yang bikin
-- programnya manual di /admin/programs kalau setuju.
--
-- Tabel BARU (bukan reuse kalkulator_lead) karena status-nya beda konsep:
-- draft/diajukan/disetujui/ditolak (review admin), bukan estimasi/diajukan +
-- follow-up manual yang dipakai buat lead jamaah.
--
-- Jalankan: mysql -u root -p jm_travel < migration-kalkulator-perwakilan-lead.sql
CREATE TABLE kalkulator_perwakilan_lead (
  id INT AUTO_INCREMENT PRIMARY KEY,
  perwakilan_id VARCHAR(36) NOT NULL,
  template_id VARCHAR(36) NOT NULL,
  paket VARCHAR(30) NOT NULL,
  kamar VARCHAR(30) NOT NULL,
  tanggal_berangkat DATE,
  addon_config JSON,
  hpp_snapshot BIGINT NOT NULL,
  margin_perwakilan BIGINT NOT NULL,
  harga_jual_perwakilan BIGINT NOT NULL,
  nama_quote VARCHAR(150) NULL,
  status ENUM('draft','diajukan','disetujui','ditolak') NOT NULL DEFAULT 'draft',
  diajukan_at TIMESTAMP NULL,
  catatan_perwakilan TEXT NULL,
  catatan_admin VARCHAR(500) NULL,
  diproses_oleh VARCHAR(36) NULL,
  diproses_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (perwakilan_id) REFERENCES users(id),
  FOREIGN KEY (template_id) REFERENCES kalkulator_template_publik(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
