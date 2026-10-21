-- Koreksi migration 243 (dikonfirmasi user 2026-10-21): yang dimaksud
-- opsional itu FOTO KTP-nya, bukan NIK-nya sendiri -- NIK tetap wajib buat
-- semua role termasuk agen. WA tetap opsional (itu memang dimaksud).
ALTER TABLE users MODIFY COLUMN nik VARCHAR(16) NOT NULL;
