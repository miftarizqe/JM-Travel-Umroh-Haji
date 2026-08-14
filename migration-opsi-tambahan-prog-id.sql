-- Opsi tambahan ternyata harus per-program (beda program bisa beda opsi &
-- harga), bukan 1 daftar global buat semua program. Tabel masih kosong
-- (belum dipakai booking manapun), jadi aman ditambah kolom wajib.
ALTER TABLE opsi_tambahan
  ADD COLUMN prog_id VARCHAR(36) NOT NULL AFTER id,
  ADD INDEX idx_prog_id (prog_id);
