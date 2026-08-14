ALTER TABLE biaya_breakdown
  ADD COLUMN total_hari_program INT NOT NULL DEFAULT 0 AFTER pax_mutawwifah,
  ADD COLUMN welcome_drink_zamzam INT NOT NULL DEFAULT 0 AFTER total_hari_program,
  ADD COLUMN manasik_umroh INT NOT NULL DEFAULT 0 AFTER welcome_drink_zamzam,
  ADD COLUMN perlengkapan_jamaah INT NOT NULL DEFAULT 0 AFTER manasik_umroh,
  ADD COLUMN haramain_express INT NOT NULL DEFAULT 0 AFTER perlengkapan_jamaah,
  ADD COLUMN handling_jeddah INT NOT NULL DEFAULT 0 AFTER haramain_express,
  ADD COLUMN komisi_rate DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER biaya_lain_lain;
