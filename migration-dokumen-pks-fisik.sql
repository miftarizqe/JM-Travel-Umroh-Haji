USE jm_travel;

-- Scan/foto dokumen SPKA/SPKA-Ins/SPKL yang SUDAH ditandatangani fisik
-- (kertas) sebelum sistem freeze/snapshot ini ada, atau hasil tanda tangan
-- basah sesudahnya — diunggah admin dari halaman cetak-pks-mitra biar bisa
-- di-cross-check sama isi yang tercatat sistem (nomor surat, pasal beku,
-- penandatangan beku). Satu file per user (dokumen legalnya cuma 1 per
-- user — SPKA atau SPKA-Ins atau SPKL, gak pernah lebih dari satu jenis).
ALTER TABLE users
  ADD COLUMN dokumen_pks_fisik_path VARCHAR(255) NULL,
  ADD COLUMN dokumen_pks_fisik_uploaded_at TIMESTAMP NULL;
