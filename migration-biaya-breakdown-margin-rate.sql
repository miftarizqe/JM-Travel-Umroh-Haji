ALTER TABLE biaya_breakdown
  ADD COLUMN margin_rate DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER komisi_rate;
