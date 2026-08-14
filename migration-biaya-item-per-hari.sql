-- Sebagian item (mis. "Mutawwif / Day") itu tarif HARIAN, bukan sekali jalan
-- — perlu dikali Total Hari Program, terpisah dari basis headcount
-- (jamaah/TL/mutawwif dst). Flag ini independen dari basis, item manapun
-- bisa ditandain "berulang tiap hari" atau enggak.
ALTER TABLE biaya_master_item
  ADD COLUMN per_hari_default TINYINT NOT NULL DEFAULT 0 AFTER basis_default;

ALTER TABLE biaya_breakdown_item
  ADD COLUMN per_hari TINYINT NOT NULL DEFAULT 0 AFTER basis;
