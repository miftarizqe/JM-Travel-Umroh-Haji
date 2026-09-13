-- Info Manasik per program — admin isi jadwal/lokasi/catatan, jamaah lihat
-- otomatis di dashboard begitu DP confirmed. Sekadar info + reminder WA
-- manual (bukan gate, tidak ada tracking konfirmasi kehadiran).
--
-- Jalankan: mysql -u root -p jm_travel < migration-program-manasik.sql
ALTER TABLE programs
  ADD COLUMN manasik_tanggal DATE NULL,
  ADD COLUMN manasik_lokasi VARCHAR(255) NULL,
  ADD COLUMN manasik_catatan TEXT NULL;
