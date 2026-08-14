ALTER TABLE biaya_breakdown
  ADD COLUMN tiket_pesawat_mata_uang ENUM('SAR','USD','IDR') NOT NULL DEFAULT 'IDR' AFTER tiket_pesawat_rate,
  ADD COLUMN visa_mata_uang ENUM('SAR','USD','IDR') NOT NULL DEFAULT 'IDR' AFTER visa_rate,
  ADD COLUMN biaya_lain_lain_mata_uang ENUM('SAR','USD','IDR') NOT NULL DEFAULT 'IDR' AFTER biaya_lain_lain;
