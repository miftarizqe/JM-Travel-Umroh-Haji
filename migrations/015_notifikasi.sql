USE jm_travel;

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  tipe VARCHAR(50) NOT NULL,
  judul VARCHAR(150) NOT NULL,
  pesan VARCHAR(500),
  link VARCHAR(255),
  dibaca TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_dibaca (user_id, dibaca)
);
