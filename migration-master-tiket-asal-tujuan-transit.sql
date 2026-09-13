-- ============================================
-- MIGRATION: Master Tiket Pesawat — Asal/Tujuan terpisah + Negara Transit
--
-- Form "Tambah/Edit Rate Tiket Pesawat" dulu cuma 1 field bebas "Nama Rute"
-- (admin ngetik "Jakarta - Jeddah" manual) — dipecah jadi 2 section jelas
-- (Asal & Tujuan), dan begitu Rute dipilih "Transit" muncul dropdown
-- "Negara Transit" (pilih dari Modul Negara yang udah ada), biar triggernya
-- jelas negara mana yang disinggahi (dikonfirmasi user 2026-08-18).
--
-- `nama_rute` TETAP ada & tetap sumber label yang dipakai di mana-mana
-- (labelMasterTiket, tiket_pesawat_list.nama pas "Isi dari Master"/checklist
-- opsi publik) — kota_asal/kota_tujuan cuma nambah struktur di form input,
-- nama_rute otomatis di-compose dari keduanya pas simpan. Baris LAMA yang
-- cuma punya nama_rute (tanpa asal/tujuan) tetap jalan apa adanya, admin
-- tinggal lengkapi belakangan kalau mau.
--
-- Jalankan sekali di MySQL, database: jm_travel
-- ============================================

ALTER TABLE master_tiket_rate
  ADD COLUMN kota_asal VARCHAR(100) NULL AFTER nama_rute,
  ADD COLUMN kota_tujuan VARCHAR(100) NULL AFTER kota_asal,
  ADD COLUMN negara_transit_id INT NULL AFTER rute;
