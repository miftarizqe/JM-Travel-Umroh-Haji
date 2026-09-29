-- Pembatalan pengajuan ganti target (dikonfirmasi user 2026-09-30) — jamaah
-- yang lagi punya pengajuan 'diajukan' bisa minta batal, TAPI TETAP wajib
-- ACC admin dulu (konsisten sama filosofi seluruh fitur Target Impian: gak
-- ada yang instan sepihak jamaah). 'pembatalan_diajukan' = lagi nunggu ACC
-- pembatalan; disetujui -> balik null (target lama otomatis aktif lagi,
-- program_id emang gak pernah disentuh selama proses ini); ditolak ->
-- balik 'diajukan' (pengajuan asal lanjut jalan lagi).
ALTER TABLE sahabat_pendaftaran
  MODIFY COLUMN target_ganti_status ENUM('diajukan','disetujui','ditolak','pembatalan_diajukan','dibatalkan') NULL;
