-- Komisi akun "agen" beneran tercatat di komisi_ledger (bukan angka
-- estimasi on-the-fly lagi) + alur pengajuan pencairan per-program, mirror
-- pengajuan_ujroh_perwakilan TAPI tanpa syarat bukti TTD fisik
-- (dikonfirmasi user 2026-10-17 — agen gak perlu approval seformal itu).
ALTER TABLE komisi_ledger MODIFY COLUMN jenis ENUM(
  'reseller_perwakilan','komisi_sahabat','closing_langsung_sahabat',
  'tabungan_awal_sahabat','head_of_program_registrasi',
  'pemakaian_saldo_sahabat','setoran_mandiri_sahabat','ujroh_perwakilan',
  'referral_closing_reguler_sahabat','operasional_sahabat',
  'koreksi_saldo_sahabat','ujroh_agen'
) NOT NULL;
ALTER TABLE komisi_ledger ADD COLUMN pengajuan_ujroh_agen_id INT NULL;

CREATE TABLE pengajuan_ujroh_agen (
  id INT AUTO_INCREMENT PRIMARY KEY,
  prog_id VARCHAR(36) NOT NULL,
  status ENUM('draft','diajukan','disetujui','ditolak') NOT NULL DEFAULT 'draft',
  grand_total BIGINT NOT NULL DEFAULT 0,
  jumlah_baris INT NOT NULL DEFAULT 0,
  dibuat_oleh VARCHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  diajukan_oleh VARCHAR(36) NULL,
  diajukan_at TIMESTAMP NULL,
  diputuskan_oleh VARCHAR(36) NULL,
  diputuskan_at TIMESTAMP NULL,
  catatan_keputusan VARCHAR(500) NULL
);
