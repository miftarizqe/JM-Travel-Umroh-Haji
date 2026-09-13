-- Daftar minat "Infokan Jika Ada Slot Kosong" — dicatat pas jamaah/agen/
-- perwakilan buka Program yang seat-nya udah 0 (form checkout disembunyiin,
-- diganti tombol ini, lihat CartPaketKamar.jsx). Satu-satunya jalur seat
-- kebuka lagi SEKARANG adalah admin approve pengajuan pembatalan (lihat
-- api/pembatalan PATCH) — begitu itu kejadian, semua baris waitlist buat
-- program itu dinotifikasi lalu DIHAPUS (one-shot, bukan langganan
-- permanen — kalau kehabisan lagi setelahnya, harus daftar ulang).
CREATE TABLE program_waitlist (
  id INT AUTO_INCREMENT PRIMARY KEY,
  program_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_program_user (program_id, user_id),
  FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
