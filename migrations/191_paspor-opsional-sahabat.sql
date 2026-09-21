-- Paspor opsional buat Sahabat Baitullah (dikonfirmasi user 2026-09-20) —
-- simpen data paspor dari awal pendaftaran (kalau jamaah udah punya), biar
-- gak perlu dimintain ulang pas jamaah udah siap berangkat & booking beneran.
-- users.no_paspor SUDAH ADA (migrations/189_no-paspor-users.sql) — di sini
-- nambah kolom pendamping-nya + kolom yang sama di sahabat_pendaftaran
-- (tabel staging, mirror pola foto_ktp_path yang udah ada di situ).
ALTER TABLE users
  ADD COLUMN tempat_keluar_paspor VARCHAR(100) NULL,
  ADD COLUMN masa_berlaku_paspor_dari DATE NULL,
  ADD COLUMN masa_berlaku_paspor_sampai DATE NULL,
  ADD COLUMN foto_paspor_path VARCHAR(255) NULL;

ALTER TABLE sahabat_pendaftaran
  ADD COLUMN no_paspor VARCHAR(20) NULL,
  ADD COLUMN tempat_keluar_paspor VARCHAR(100) NULL,
  ADD COLUMN masa_berlaku_paspor_dari DATE NULL,
  ADD COLUMN masa_berlaku_paspor_sampai DATE NULL,
  ADD COLUMN foto_paspor_path VARCHAR(255) NULL;
