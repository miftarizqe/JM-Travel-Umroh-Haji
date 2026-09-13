-- ============================================================
-- MIGRATION: Jalur TTD digital + materai digital untuk semua
-- dokumen perjanjian (SPKA-Ins, Perjanjian Jamaah, Formulir
-- Pendaftaran, Invoice/Kwitansi).
--
-- Provider TTD & materai (Peruri) belum disambung — kolom
-- *_provider/*_provider_ref disiapkan buat plug-in nanti, untuk
-- sekarang cuma diisi 'mock'. Jalur cetak fisik existing (upload
-- scan manual) TIDAK berubah, tabel ini murni tambahan.
--
-- Jalankan: mysql -u root -p jm_travel < migration-ttd-materai-digital.sql
-- ============================================================

CREATE TABLE dokumen_signature (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dokumen ENUM('spka_ins','jamaah','formulir','invoice') NOT NULL,
  ref_id VARCHAR(36) NOT NULL,              -- users.id | bookings.id | invoice_kwitansi.id
  metode ENUM('fisik','digital') NOT NULL DEFAULT 'digital',
  fase ENUM('draft','materai_pending','materai_selesai','materai_gagal',
             'ttd_terkirim','ttd_menunggu','selesai','gagal','dibatalkan')
       NOT NULL DEFAULT 'draft',
  perlu_materai TINYINT(1) NOT NULL DEFAULT 0,
  materai_provider VARCHAR(20) DEFAULT NULL,
  materai_kode_unik VARCHAR(100) DEFAULT NULL,
  materai_dibeli_at TIMESTAMP NULL,
  ttd_provider VARCHAR(20) DEFAULT NULL,
  ttd_provider_ref VARCHAR(255) DEFAULT NULL,
  signer_nama VARCHAR(150) DEFAULT NULL,
  signer_email VARCHAR(150) DEFAULT NULL,
  signer_wa VARCHAR(30) DEFAULT NULL,
  pdf_awal_path VARCHAR(255) DEFAULT NULL,
  pdf_bermaterai_path VARCHAR(255) DEFAULT NULL,
  pdf_final_path VARCHAR(255) DEFAULT NULL,
  requested_by VARCHAR(36) DEFAULT NULL,
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  catatan VARCHAR(255) DEFAULT NULL,
  UNIQUE KEY uniq_dokumen_ref (dokumen, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
