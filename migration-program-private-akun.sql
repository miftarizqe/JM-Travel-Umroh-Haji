-- Program Private: admin bisa nunjuk akun jamaah tertentu (bisa lebih dari
-- 1) yang boleh LIHAT+CHECKOUT SENDIRI program itu, di luar admin sendiri
-- (dikonfirmasi user 2026-09-06) — sebelumnya program Private cuma bisa
-- didaftarin admin langsung dari panel, gak ada jalur self-checkout sama
-- sekali. Mirror PERSIS pola program_perwakilan, bedanya nunjuk ke akun
-- jamaah spesifik (user_id), bukan seluruh role perwakilan.
CREATE TABLE program_private_akun (
  id INT NOT NULL AUTO_INCREMENT,
  program_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_program_user (program_id, user_id),
  KEY idx_user (user_id),
  CONSTRAINT program_private_akun_ibfk_1 FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
