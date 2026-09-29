-- Ganti Target Impian (program eksklusif) buat Sahabat Baitullah yang udah
-- pilih target di awal (dikonfirmasi user 2026-09-29) — jamaah ajukan dari
-- Profil, admin/super_admin ACC. TIDAK menyentuh dokumen legal yang udah
-- ditandatangani (SK-CIF/Surat Pemblokiran/SPK-AK) sama sekali — dikonfirmasi
-- user eksplisit "gausah ada perjanjian lagi ya untuk perubahan ini", jadi
-- nominal_blokir_tabungan/jangka_waktu_blokir_hari/tanggal_mulai_blokir di
-- tabel users TIDAK ikut di-reset di sini.
--
-- Cuma 1 pengajuan aktif per user (status 'diajukan' = lagi nunggu ACC) —
-- gak perlu tabel terpisah, mirror pola kolom *_at di tabel yang sama
-- kayak setuju_sk_cif_pemblokiran_at, bukan riwayat banyak baris.
ALTER TABLE sahabat_pendaftaran
  ADD COLUMN target_ganti_program_id VARCHAR(36) NULL AFTER program_id,
  ADD COLUMN target_ganti_status ENUM('diajukan','disetujui','ditolak') NULL AFTER target_ganti_program_id,
  ADD COLUMN target_ganti_diajukan_at TIMESTAMP NULL AFTER target_ganti_status,
  ADD COLUMN target_ganti_diproses_at TIMESTAMP NULL AFTER target_ganti_diajukan_at,
  ADD COLUMN target_ganti_catatan_admin VARCHAR(255) NULL AFTER target_ganti_diproses_at;
