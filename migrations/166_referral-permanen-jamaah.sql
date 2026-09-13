-- ============================================================
-- MIGRATION: Referral permanen jamaah (perwakilan & koperasi/Sejuta Baitullah)
-- Diisi SEKALI saat registrasi (role='jamaah' + ?ref= valid), TIDAK PERNAH
-- diubah lagi lewat UI/API manapun (termasuk admin) — kalau salah input,
-- satu-satunya jalur perbaikan adalah runbook manual super_admin yang
-- WAJIB dicatat ke audit_log, bukan lewat endpoint/tombol.
-- ============================================================

ALTER TABLE users
  ADD COLUMN perekrut_perwakilan_jamaah_id VARCHAR(36) NULL
    COMMENT 'Perwakilan yg mereferensikan jamaah ini SAAT REGISTRASI — permanen, immutable. TERPISAH dari perekrut_id (rantai perwakilan-rekrut-perwakilan).',
  ADD COLUMN perekrut_koperasi_jamaah_id VARCHAR(36) NULL
    COMMENT 'Anggota koperasi (Sejuta Baitullah) yg mereferensikan jamaah ini SAAT REGISTRASI — permanen, immutable. Dipakai utk komisi flat referral_closing_reguler_koperasi tiap closing program reguler.';

CREATE INDEX idx_users_perekrut_perwakilan_jamaah ON users (perekrut_perwakilan_jamaah_id);
CREATE INDEX idx_users_perekrut_koperasi_jamaah ON users (perekrut_koperasi_jamaah_id);

-- Jenis ujroh baru: komisi flat 1jt koperasi utk jamaah rekrutan yg closing
-- program REGULER (bukan program Sejuta Baitullah sendiri, yg punya cascade
-- 5-generasi terpisah di status-pendaftaran-koperasi).
ALTER TABLE komisi_ledger
  MODIFY COLUMN jenis ENUM(
    'reseller_perwakilan','komisi_koperasi','closing_langsung_koperasi',
    'tabungan_awal_sejuta','head_of_program_registrasi','pemakaian_saldo_sejuta',
    'setoran_mandiri_sejuta','ujroh_perwakilan','referral_closing_reguler_koperasi'
  ) NOT NULL;

-- Reminder H-2 sebelum auto-terima perlengkapan (7 hari) — guard biar gak
-- kekirim dua kali per baris pengiriman.
ALTER TABLE perlengkapan_pengiriman
  ADD COLUMN reminder_terkirim_at TIMESTAMP NULL;

-- ============================================================
-- RUNBOOK KOREKSI DARURAT (super_admin only, BUKAN lewat UI/endpoint)
-- Dipakai HANYA kalau ada kesalahan data-entry pada kolom permanen di atas
-- (link referral salah, hasil backfill keliru, dsb). WAJIB dicatat manual
-- ke tabel audit_log (siapa, kapan, alasan, nilai lama & baru) SEBELUM
-- query ini dijalankan.
--
--   UPDATE users SET perekrut_perwakilan_jamaah_id = '<id_perwakilan_baru>'
--   WHERE id = '<id_jamaah>';
--
--   UPDATE users SET perekrut_koperasi_jamaah_id = '<id_koperasi_baru>'
--   WHERE id = '<id_jamaah>';
-- ============================================================
