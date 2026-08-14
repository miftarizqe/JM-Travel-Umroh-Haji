-- Tambah headcount Driver — dipakai buat item yang kadang ikut dibudgetin
-- buat sopir juga (mis. snack/makanan pas City Tour pakai Bus/Hi-Ace), bukan
-- cuma jamaah/TL/mutawwif.
ALTER TABLE biaya_breakdown
  ADD COLUMN pax_driver INT NOT NULL DEFAULT 0 AFTER pax_mutawwifah;

ALTER TABLE biaya_breakdown_item
  MODIFY COLUMN basis ENUM('jamaah','jamaah_tl','jamaah_tl_mutawwif','tl','mutawwif','mutawwifah',
    'driver','jamaah_driver','jamaah_tl_driver','jamaah_tl_mutawwif_driver','flat')
    NOT NULL DEFAULT 'jamaah';

ALTER TABLE biaya_master_item
  MODIFY COLUMN basis_default ENUM('jamaah','jamaah_tl','jamaah_tl_mutawwif','tl','mutawwif','mutawwifah',
    'driver','jamaah_driver','jamaah_tl_driver','jamaah_tl_mutawwif_driver','flat')
    NOT NULL DEFAULT 'jamaah';
