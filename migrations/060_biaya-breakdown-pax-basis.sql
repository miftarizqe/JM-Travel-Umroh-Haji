ALTER TABLE biaya_breakdown
  ADD COLUMN pax_jamaah INT NOT NULL DEFAULT 0 AFTER paket,
  ADD COLUMN pax_tl INT NOT NULL DEFAULT 0 AFTER pax_jamaah,
  ADD COLUMN pax_mutawwif INT NOT NULL DEFAULT 0 AFTER pax_tl,
  ADD COLUMN pax_mutawwifah INT NOT NULL DEFAULT 0 AFTER pax_mutawwif,
  ADD COLUMN tiket_pesawat_rate DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER hotel_madinah_mata_uang,
  ADD COLUMN biaya_lain_lain DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER tiket_pesawat_rate;

ALTER TABLE biaya_breakdown_item
  ADD COLUMN basis ENUM('jamaah','jamaah_tl','jamaah_tl_mutawwif','tl','mutawwif','mutawwifah','flat')
    NOT NULL DEFAULT 'jamaah' AFTER mata_uang;

ALTER TABLE biaya_master_item
  ADD COLUMN basis_default ENUM('jamaah','jamaah_tl','jamaah_tl_mutawwif','tl','mutawwif','mutawwifah','flat')
    NOT NULL DEFAULT 'jamaah' AFTER mata_uang;

-- Set basis_default sesuai formula asli sheet "Umroh Regular", per item yang sudah di-seed dari sheet "Master"
UPDATE biaya_master_item SET basis_default = 'jamaah_tl_mutawwif' WHERE kelompok = 'Cost Saudi (Via Mutawwif)';
UPDATE biaya_master_item SET basis_default = 'mutawwif' WHERE nama IN ('Ongkos mutawwif ke Airport Jeddah','Ongkos mutawwif dari Airport Jeddah','Mutawwif / Day');
UPDATE biaya_master_item SET basis_default = 'mutawwifah' WHERE nama LIKE 'Mutawwifaf raudhoh%';
UPDATE biaya_master_item SET basis_default = 'jamaah_tl' WHERE kelompok IN ('Cost Jakarta (Via Management)','Handling Alfiyah');
UPDATE biaya_master_item SET basis_default = 'tl' WHERE nama = 'Fee - Fee Tour Leader' OR kelompok = 'Cost Tour Leader';
UPDATE biaya_master_item SET basis_default = 'flat' WHERE kelompok = 'Cost Transportation';
