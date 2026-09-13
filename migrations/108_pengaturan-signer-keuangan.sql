-- Penandatangan khusus buat Invoice/Kwitansi (dokumen keuangan) — terpisah
-- dari nama_penandatangan umum yang dipakai di SPKA/SPKA-Ins/SPKL/Proposal,
-- karena orang finance beda sama pihak yang tanda tangan dokumen legal.
-- Fallback ke nama_penandatangan umum kalau field ini kosong.
ALTER TABLE pengaturan
  ADD COLUMN nama_penandatangan_keuangan VARCHAR(150) NULL,
  ADD COLUMN jabatan_penandatangan_keuangan VARCHAR(150) NULL,
  ADD COLUMN ttd_penandatangan_keuangan_path VARCHAR(255) NULL,
  ADD COLUMN cap_perusahaan_path VARCHAR(255) NULL;
