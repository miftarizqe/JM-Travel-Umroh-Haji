-- Bantuan pembuatan rekening BSI manual ke cabang (dikonfirmasi user
-- 2026-10-03) -- gak semua KTP bisa daftar Tabungan Umroh via BYOND
-- self-service, sebagian butuh proses manual di cabang. Jamaah yang
-- kejebak di sini bisa setuju identitasnya diserahkan JM Travel ke BSI
-- buat dibukain rekening manual -- rekeningnya TETAP KOSONG sampai admin
-- isi manual begitu BSI selesai proses (lihat no_rekening_tabungan_umroh,
-- udah ada). Timestamp consent ini dipakai gantiin syarat "rekening sudah
-- diisi" di funnel pendaftaran (boleh lanjut ke SK-CIF/Blokir walau
-- rekeningnya masih kosong).
ALTER TABLE users
  ADD COLUMN bantuan_bsi_manual_disetujui_at DATETIME NULL AFTER no_rekening_tabungan_umroh;
