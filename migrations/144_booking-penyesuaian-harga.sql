-- Penyesuaian harga saat pelunasan (kenaikan harga tiket, force majeure,
-- dll) — admin ajukan harga baru + alasan, jamaah WAJIB setuju eksplisit
-- (bagian dari catatan legal terkait Perjanjian Jamaah) sebelum bisa lanjut
-- submit bukti pelunasan. Cuma 1 baris 'pending' aktif per booking pada satu
-- waktu (dicek di endpoint, bukan constraint DB). Begitu jamaah setuju,
-- bookings.total_harga langsung ikut di-update (tidak ada step "terapkan"
-- admin terpisah) — lihat POST /api/penyesuaian-harga/[id]/setuju.
--
-- Jalankan: mysql -u root -p jm_travel < migration-booking-penyesuaian-harga.sql
CREATE TABLE booking_penyesuaian_harga (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id VARCHAR(20) NOT NULL,
  harga_lama BIGINT NOT NULL,
  harga_baru BIGINT NOT NULL,
  alasan TEXT NOT NULL,
  diajukan_oleh VARCHAR(36) NULL,
  diajukan_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  disetujui_at TIMESTAMP NULL,
  status ENUM('pending','disetujui') NOT NULL DEFAULT 'pending',
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (diajukan_oleh) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
