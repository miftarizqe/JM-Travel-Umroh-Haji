USE jm_travel;

CREATE TABLE IF NOT EXISTS audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  actor_id VARCHAR(36) NOT NULL,
  actor_nama VARCHAR(150),
  aksi VARCHAR(50) NOT NULL,
  target_type VARCHAR(30) NOT NULL,
  target_id VARCHAR(50) NOT NULL,
  keterangan VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_target (target_type, target_id),
  INDEX idx_actor (actor_id)
);
