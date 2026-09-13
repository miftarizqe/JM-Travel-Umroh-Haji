ALTER TABLE koperasi_pendaftaran
  ADD COLUMN target_bulan INT NULL AFTER target_estimasi_harga,
  ADD COLUMN target_set_at TIMESTAMP NULL AFTER target_bulan;
