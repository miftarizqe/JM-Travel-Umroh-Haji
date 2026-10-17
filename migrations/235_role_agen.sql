-- Role "agen" — akun login minimal cuma buat ambil link referral pribadi
-- (dikonfirmasi user 2026-10-17, lihat plan elegant-puzzling-spring). Beda
-- dari role "agen" lama yang dihapus total 2026-08-14 — ini versi jauh
-- lebih tipis, gak ada dashboard/funnel/komisi otomatis sama sekali, cuma
-- nge-tag booking yang datang lewat link mereka.
ALTER TABLE users MODIFY COLUMN role
  ENUM('jamaah','perwakilan','admin','super_admin','sahabat_baitullah','hop','agen') NOT NULL;

ALTER TABLE bookings ADD COLUMN referral_agen_id VARCHAR(36) NULL AFTER referral_sahabat_id;
