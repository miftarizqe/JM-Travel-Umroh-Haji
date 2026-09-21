-- Restrukturisasi alur pendaftaran Sahabat Baitullah (2026-09-19): SPK-AK
-- pindah ke wizard (wajib digital), gerbang admin akun_bsi_status/
-- tabungan_haji_status dihapus (jamaah langsung isi CIF+data blokir),
-- SK-CIF & Surat Pemblokiran digabung jadi 1 step baca-&-setuju (checkbox
-- baru di bawah), baru cetak-fisik (opsional, gak lagi jadi syarat ACC).
ALTER TABLE users
  ADD COLUMN setuju_sk_cif_pemblokiran_at TIMESTAMP NULL;

-- Back-link administratif Program Eksklusif yang dibuat admin dari target
-- tabungan jamaah — mirror migrations/168_kalkulator-perwakilan-lead-program-id.sql.
-- BUKAN dipakai buat otorisasi (itu tetap lewat program_private_akun),
-- cuma nandain "target ini udah pernah dibikinin program".
ALTER TABLE sahabat_pendaftaran
  ADD COLUMN program_id VARCHAR(36) NULL,
  ADD CONSTRAINT fk_sahabat_pendaftaran_program FOREIGN KEY (program_id) REFERENCES programs(id);

-- Step 'menunggu_bsi' dihapus dari alur (lihat STEP_PENDAFTARAN_SAHABAT) —
-- backfill baris lama yang nyangkut di situ biar gak orphan.
UPDATE sahabat_pendaftaran SET status = 'menunggu_sk_cif' WHERE status = 'menunggu_bsi';
