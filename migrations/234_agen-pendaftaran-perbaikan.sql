-- Minta Perbaikan buat pendaftaran Perwakilan — mirror sahabat_pendaftaran
-- (migration 206/sahabat punya kolom ini sejak minta_perbaikan ditambah
-- 2026-10-11, dikonfirmasi user 2026-10-17). Dulu admin perwakilan cuma
-- punya 2 opsi (ACC/Tolak Permanen), gak ada jalan tengah minta data
-- diperbaiki tanpa ngunci login applicant-nya.
ALTER TABLE agen_pendaftaran ADD COLUMN perbaikan_diminta_at DATETIME NULL AFTER catatan_admin;
