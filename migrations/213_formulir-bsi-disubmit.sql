-- Tracking "admin udah submit Formulir Pendaftaran Rekening BSI ke bank"
-- (dikonfirmasi user 2026-10-08) -- beda dari bantuan_bsi_manual_disetujui_at
-- (itu persetujuan JAMAAH doang) & no_rekening_tabungan_umroh (hasil akhir,
-- baru keisi pas BSI selesai proses). Sebelumnya gak ada checklist sama
-- sekali buat langkah tengah ini, admin gak ada cara nandain "udah gue
-- submit ke bank" di modal ACC pendaftaran sahabat.
ALTER TABLE users
  ADD COLUMN formulir_bsi_disubmit_at DATETIME NULL AFTER bantuan_bsi_manual_disetujui_at;
