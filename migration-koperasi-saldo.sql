-- ============================================================
-- MIGRATION: Checklist konfirmasi saldo tabungan umroh koperasi (super_admin
-- acc manual setelah transfer BSI beneran terkirim) + jenis komisi baru buat
-- earning "closing langsung" (jamaah booking langsung dibantu anggota
-- koperasi, TERPISAH dari komisi flat rekrutan) + persentase bagian anggota
-- koperasi dari closing langsung (default 0 — belum ditentukan, admin isi
-- kapan pun angkanya fix, sistem gak nebak nominal).
--
-- Jalankan: mysql -u root -p jm_travel < migration-koperasi-saldo.sql
-- ============================================================

ALTER TABLE komisi_ledger
  ADD COLUMN dikonfirmasi_at TIMESTAMP NULL AFTER keterangan,
  MODIFY COLUMN jenis ENUM('reseller_perwakilan','komisi_koperasi','closing_langsung_koperasi') NOT NULL;

ALTER TABLE pengaturan
  ADD COLUMN komisi_koperasi_closing_persen DECIMAL(5,2) NOT NULL DEFAULT 0;
