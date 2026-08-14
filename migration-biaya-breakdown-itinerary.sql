-- Itinerary & Include/Exclude di level Kalkulator/Template — biar pas admin
-- input paket dari PDF agen lain (harga + rundown), semuanya kepasang di 1
-- tempat (bukan cuma di form Program terpisah). Bentuk sama kayak kolom yang
-- sudah ada di `programs` (lihat migration-detail-program.sql) biar gampang
-- disalin/diselaraskan.
ALTER TABLE biaya_breakdown
  ADD COLUMN include_items TEXT NULL AFTER modul_tambahan,
  ADD COLUMN exclude_items TEXT NULL AFTER include_items,
  ADD COLUMN itinerary JSON NULL AFTER exclude_items;
