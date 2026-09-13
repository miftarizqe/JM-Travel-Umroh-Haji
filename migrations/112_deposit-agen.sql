USE jm_travel;

-- Memo Internal No. 00014/JM-IM/07.26 (efektif 1 Agustus 2026), poin 4:
-- calon agen wajib punya Tabungan BSI + setoran awal Rp1.000.000 sebagai
-- syarat pengangkatan. Kolom ini beda dari users.tabungan_bsi (itu saldo
-- komisi berjalan, bukan bukti setoran awal) — jangan ketuker.
ALTER TABLE agen_pendaftaran
  ADD COLUMN bukti_setoran_bsi_path VARCHAR(255) DEFAULT NULL,
  ADD COLUMN bukti_setoran_bsi_nama VARCHAR(255) DEFAULT NULL,
  ADD COLUMN bukti_setoran_bsi_uploaded_at TIMESTAMP NULL DEFAULT NULL;
