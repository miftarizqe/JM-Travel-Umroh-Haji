-- Publikasi "Khusus Agen" — sama polanya kayak program_perwakilan
-- (migration-program-perwakilan-private.sql), cuma buat role agen. Komisi
-- agen sendiri tetap fixed per program (ujroh_*), gak ada harga custom per
-- agen kayak perwakilan_harga — jadi cukup tabel otorisasi doang, gak perlu
-- tabel harga terpisah.
CREATE TABLE program_agen (
  id INT AUTO_INCREMENT PRIMARY KEY,
  program_id VARCHAR(36) NOT NULL,
  agen_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_program_agen (program_id, agen_id),
  KEY idx_agen (agen_id),
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
);

ALTER TABLE programs MODIFY publish_type ENUM('public','perwakilan','private','agen') DEFAULT 'public';
