-- ============================================================
-- MIGRATION: Override Leader Berjenjang
-- Menambah jenis komisi baru di komisi_ledger sesuai Lampiran I bagian 4:
--   Leader 3 (perekrut Leader 4) : Rp 250.000 / jamaah
--   Leader 2 (perekrut Leader 3) : Rp 150.000 / jamaah
--   Leader 1 (perekrut Leader 2) : Rp 100.000 / jamaah
-- Hanya diberikan kepada upline yang JUGA berstatus Leader.
-- Jalankan sekali di MySQL, database: jm_travel
-- ============================================================

ALTER TABLE komisi_ledger
  MODIFY COLUMN jenis ENUM(
    'closing_pribadi',
    'closing_bsi',
    'override_l1',
    'override_l2',
    'override_l3',
    'leader',
    'leader_override_l1',
    'leader_override_l2',
    'leader_override_l3'
  ) NOT NULL;
