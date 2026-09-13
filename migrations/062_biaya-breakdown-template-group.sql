ALTER TABLE biaya_breakdown
  ADD COLUMN template_group VARCHAR(36) NULL AFTER is_template,
  ADD INDEX idx_template_group (template_group);
