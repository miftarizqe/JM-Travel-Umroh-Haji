-- Revert migration-biaya-item-per-hari.sql — per_hari akhirnya dideteksi
-- OTOMATIS dari nama item (suffix "/ Day" atau "/ Hari"), bukan toggle
-- manual, jadi kolom terpisah ini gak jadi kepake.
ALTER TABLE biaya_master_item DROP COLUMN per_hari_default;
ALTER TABLE biaya_breakdown_item DROP COLUMN per_hari;
