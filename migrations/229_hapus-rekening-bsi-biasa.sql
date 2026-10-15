-- Hapus kolom no_rekening_bsi_biasa (dikonfirmasi user 2026-10-14): redundan,
-- alur "Rekening BSI Biasa" udah lama gak ada input-nya di sisi jamaah
-- (status-pendaftaran-sahabat cuma minta Rekening Tabungan Umroh), jadi
-- kolom ini gak pernah keisi lagi & cuma bikin form Edit Rekening di
-- Database Jamaah Sahabat dobel. Sahabat cukup 1 rekening: Tabungan Umroh
-- (no_rekening_tabungan_umroh + nama_pemilik_rekening_umroh, selalu BSI).
-- akun_bsi_status/akun_bsi_updated_at SENGAJA gak ikut di-drop -- masih
-- di-SELECT di /api/sahabat/dashboard & dicatat permanen (lihat 148).
ALTER TABLE users DROP COLUMN no_rekening_bsi_biasa;
