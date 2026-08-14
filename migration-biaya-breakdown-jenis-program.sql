-- Kategori/jenis program di kalkulator biaya (Umroh Regular / Umroh + Dubai /
-- Umroh + Turkey, dst) — bukan sama dengan `programs.kategori` (tier komisi
-- agen, lihat migration-komisi-agen.sql), makanya dinamai beda.
-- jenis_program VARCHAR bebas isi (bukan ENUM) biar nambah negara baru nanti
-- gak perlu migration schema lagi — ikut konvensi biaya_master_item.kelompok.
ALTER TABLE biaya_breakdown
  ADD COLUMN jenis_program VARCHAR(40) NOT NULL DEFAULT 'umroh_regular' AFTER template_group,
  ADD COLUMN modul_tambahan JSON NULL AFTER jenis_program;
