-- Perluas kategori pengeluaran_operasional: tambah operasional kantor (ATK),
-- sistem/teknologi (hosting, WA API, dll), dan legal & perizinan.
ALTER TABLE pengeluaran_operasional
  MODIFY kategori ENUM('gaji','sewa','marketing','utilitas','atk_kantor','sistem_teknologi','legal_perizinan','lain_lain')
  NOT NULL DEFAULT 'lain_lain';
