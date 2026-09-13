-- Bedain gaya tampil tiap baris konten dokumen legal — sebelumnya SEMUA
-- baris (apa pun dokumennya) dilabelin "Pasal N — Judul", padahal SK-CIF &
-- Surat Pemblokiran itu SURAT PERNYATAAN (nasabah menyatakan sesuatu ke
-- BSI), bukan perjanjian 2 pihak berpasal kayak SPKA-Ins/SPK-AK/SPJ —
-- dikonfirmasi user 2026-09-09.
--
-- 3 tipe:
--   pasal       - pasal formal berpenomoran ("Pasal 1 — Judul") - default,
--                  dipakai SPKA-Ins/SPK-AK/SPJ (perjanjian 2 pihak).
--   isian       - blok field (identitas dkk) - cuma judul jadi heading,
--                  TANPA kata "Pasal".
--   pernyataan  - poin pernyataan bernomor polos ("1. isi..."), TANPA
--                  heading/judul ditampilkan sama sekali.
--
-- Admin TIDAK perlu milih tipe ini manual di form — diklasifikasi sekali di
-- sini (dikonfirmasi user: "lo yang nentuin"), default kolom tetap 'pasal'
-- biar dokumen lama (spka_ins/jamaah/spk_ak) otomatis gak berubah tampilan.
ALTER TABLE dokumen_pasal
  ADD COLUMN tipe ENUM('pasal','isian','pernyataan') NOT NULL DEFAULT 'pasal' AFTER nomor;

ALTER TABLE dokumen_pasal_snapshot
  ADD COLUMN tipe ENUM('pasal','isian','pernyataan') NOT NULL DEFAULT 'pasal' AFTER nomor;

UPDATE dokumen_pasal SET tipe = 'isian' WHERE dokumen = 'surat_pemblokiran' AND nomor = 1;
UPDATE dokumen_pasal SET tipe = 'pernyataan' WHERE dokumen = 'surat_pemblokiran' AND nomor IN (2, 3, 4);
