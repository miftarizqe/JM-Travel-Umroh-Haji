-- Multi-perwakilan exclusive + tipe publikasi "Private" baru.
--
-- program_perwakilan = daftar perwakilan yang boleh closing 1 program
-- 'perwakilan' (many-to-many) — GANTI mekanisme programs.perw_id (kolom
-- tunggal) yang ternyata gak pernah beneran kesimpen/dipakai admin editor
-- (bug lama, "exclusive" cuma nentuin harga selama ini, gak ngebatasin
-- akses beneran). programs.perw_id DIBIARKAN apa adanya (gak dipakai lagi,
-- gak di-drop biar gak ada resiko ke data lama).
CREATE TABLE program_perwakilan (
  id INT AUTO_INCREMENT PRIMARY KEY,
  program_id VARCHAR(36) NOT NULL,
  perw_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_program_perw (program_id, perw_id),
  KEY idx_perw (perw_id),
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
);

-- 'private' = cuma admin yang bisa daftarin jamaah (booking manual dari
-- admin panel) — gak pernah muncul di listing publik/perwakilan/agen sama
-- sekali, beda dari 'perwakilan' yang masih bisa closing sendiri via
-- perwakilan yang diotorisasi.
ALTER TABLE programs MODIFY publish_type ENUM('public','perwakilan','private') DEFAULT 'public';
