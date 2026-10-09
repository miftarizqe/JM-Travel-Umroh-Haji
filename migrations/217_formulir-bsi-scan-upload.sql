-- "Unggah scan" dokumen fisik yang sudah ditandatangani (buat pemberkasan
-- JM Travel sendiri) sudah ada buat SPK-AK/SK-CIF/Surat Pemblokiran
-- (dokumen_*_fisik_path/_uploaded_at di migration 148), tapi Formulir
-- Pendaftaran Rekening BSI (dokumen ke-4, cuma relevan buat jamaah yang
-- juga setuju bantuan BSI manual) belum kebagian kolom ini sama sekali --
-- ketemu user 2026-10-09, link "Unggah scan"-nya kosong di checklist admin.
ALTER TABLE users
  ADD COLUMN dokumen_formulir_bsi_fisik_path VARCHAR(255) NULL AFTER dokumen_formulir_bsi_fisik_diterima_at,
  ADD COLUMN dokumen_formulir_bsi_fisik_uploaded_at TIMESTAMP NULL AFTER dokumen_formulir_bsi_fisik_path;
