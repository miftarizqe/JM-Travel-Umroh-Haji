-- HoP is management, independent from Sahabat Baitullah membership.
-- Existing users and the designated Sahabat commission recipient stay intact.
ALTER TABLE users
  MODIFY COLUMN role ENUM('jamaah','perwakilan','admin','super_admin','sahabat_baitullah','hop') NOT NULL;
