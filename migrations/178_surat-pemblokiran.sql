-- ============================================================
-- MIGRATION: Surat Pernyataan Kuasa Blokir Rekening & Instruksi
-- Pemindahbukuan (dokumen ke-4 program Sahabat Baitullah, DITARUH SETELAH
-- SK-CIF & Surat Kuasa Multi CIF BSI — dikonfirmasi user 2026-09-09).
--
-- Dokumen ini dari BSI: nasabah (Pemberi Pernyataan) memberi kuasa BLOKIR
-- SALDO rekening tabungan umroh-nya sejumlah nominal & jangka waktu
-- tertentu, sekaligus instruksi PENDEBETAN + PEMINDAHBUKUAN dana itu ke
-- rekening PT Alkhalid Jaya Megah buat pembelian Paket Ibadah Umroh.
-- SATU PIHAK yang TTD (si nasabah saja, "Mengetahui Petugas Bank" itu
-- pihak BSI bukan JM Travel) — pola persis sk_cif, BUKAN surat_kuasa_cif
-- (yang 2 pihak + signer institusi JM Travel). Wajib fisik+materai asli
-- (dikirim ke BSI), gak pernah masuk pipeline TTD digital, sama seperti
-- sk_cif/surat_kuasa_cif.
--
-- Nominal blokir, jangka waktu (hari), dan tanggal mulai blokir di
-- template aslinya dikosongkan buat diisi tangan — di sistem ini diisi
-- self-service oleh anggota sahabat SEBELUM surat dicetak (dikonfirmasi
-- user 2026-09-09), lalu di-merge ke pasal lewat {{nominal_blokir}}/
-- {{jangka_waktu_hari}}/{{tanggal_mulai_blokir}} (sudah diformat Rupiah/
-- tanggal Indonesia server-side, bukan raw number).
-- ============================================================

-- 1) Nomor surat resmi + path scan fisik (pola sama no_sk_cif/no_surat_kuasa_cif).
ALTER TABLE users
  ADD COLUMN no_surat_pemblokiran VARCHAR(50) NULL AFTER no_surat_kuasa_cif,
  ADD COLUMN dokumen_surat_pemblokiran_fisik_path VARCHAR(255) NULL AFTER dokumen_surat_kuasa_cif_fisik_uploaded_at,
  ADD COLUMN dokumen_surat_pemblokiran_fisik_uploaded_at TIMESTAMP NULL AFTER dokumen_surat_pemblokiran_fisik_path;

-- 2) Data blokir — diisi SEKALI oleh anggota sahabat sendiri (self-service,
-- pola sama cif_bsi) sebelum surat ini bisa dicetak.
ALTER TABLE users
  ADD COLUMN nominal_blokir_tabungan BIGINT NULL AFTER dokumen_surat_pemblokiran_fisik_uploaded_at,
  ADD COLUMN jangka_waktu_blokir_hari INT NULL AFTER nominal_blokir_tabungan,
  ADD COLUMN tanggal_mulai_blokir DATE NULL AFTER jangka_waktu_blokir_hari;

-- 3) Daftarkan 'surat_pemblokiran' ke tabel ENUM dokumen legal — SATU PIHAK
-- (kayak sk_cif) jadi TIDAK butuh dokumen_signer_snapshot.
ALTER TABLE dokumen_signature
  MODIFY COLUMN dokumen ENUM('spka_ins','jamaah','formulir','invoice','spk_ak','sk_cif','surat_kuasa_cif','surat_pemblokiran') NOT NULL;

ALTER TABLE dokumen_pasal
  MODIFY COLUMN dokumen ENUM('spka_ins','jamaah','spk_ak','sk_cif','surat_kuasa_cif','surat_pemblokiran') NOT NULL;

ALTER TABLE dokumen_pasal_snapshot
  MODIFY COLUMN dokumen ENUM('spka','spka_ins','spkl','jamaah','spk_ak','sk_cif','surat_kuasa_cif','surat_pemblokiran') NOT NULL;

ALTER TABLE dokumen_signer_snapshot
  MODIFY COLUMN dokumen ENUM('spka','spka_ins','spkl','jamaah','spk_ak','sk_cif','surat_kuasa_cif','surat_pemblokiran') NOT NULL;
