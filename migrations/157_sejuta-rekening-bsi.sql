ALTER TABLE users
  ADD COLUMN no_rekening_bsi_biasa VARCHAR(50) NULL AFTER cif_bsi,
  ADD COLUMN no_rekening_tabungan_umroh VARCHAR(50) NULL AFTER no_rekening_bsi_biasa,
  ADD COLUMN dokumen_cif_fisik_diterima_at TIMESTAMP NULL AFTER dokumen_sk_cif_fisik_uploaded_at;
