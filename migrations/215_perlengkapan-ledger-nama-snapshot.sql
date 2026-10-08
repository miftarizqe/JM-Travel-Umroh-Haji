-- Nama item di-snapshot langsung ke ledger (dikonfirmasi user 2026-10-08)
-- -- sebelumnya nama_item cuma diambil lewat JOIN live ke perlengkapan_jamaah
-- pas ditampilin, jadi kalau item-nya DIHAPUS (fitur hapus baru), nama di
-- riwayat lama ikut hilang/kosong. Sekarang nama dibekukan di baris ledger
-- itu sendiri, independen dari item-nya masih ada atau enggak.
ALTER TABLE perlengkapan_stok_ledger
  ADD COLUMN nama_item VARCHAR(255) NULL AFTER item_id;

-- Backfill seluruh riwayat yang udah ada SEKARANG, sebelum sempat ada
-- penghapusan item apa pun -- biar riwayat lama juga ikut aman.
UPDATE perlengkapan_stok_ledger l
  JOIN perlengkapan_jamaah p ON p.id = l.item_id
  SET l.nama_item = p.nama
  WHERE l.nama_item IS NULL;
