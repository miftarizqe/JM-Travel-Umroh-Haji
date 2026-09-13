ALTER TABLE komisi_ledger
  MODIFY COLUMN jenis ENUM('reseller_perwakilan','komisi_koperasi','closing_langsung_koperasi','tabungan_awal_sejuta','head_of_program_registrasi','pemakaian_saldo_sejuta') NOT NULL;
