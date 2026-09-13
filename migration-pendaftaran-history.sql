-- ============================================================
-- MIGRATION: Riwayat status pendaftaran (perwakilan & koperasi) buat
-- popup history di /profil, + kolom atribusi "closing langsung" koperasi
-- di bookings.
--
-- agen_pendaftaran & koperasi_pendaftaran cuma nyimpen status TERKINI
-- (di-overwrite tiap UPDATE) — tabel log generik ini nyimpen tiap
-- transisi status funnel dengan timestamp-nya, dipakai KEDUA role lewat
-- kolom `tipe` (bukan bikin 2 tabel history terpisah).
--
-- Jalankan: mysql -u root -p jm_travel < migration-pendaftaran-history.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS pendaftaran_status_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tipe ENUM('perwakilan','koperasi') NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  status_baru VARCHAR(30) NOT NULL,
  catatan VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (tipe, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Atribusi "closing langsung" koperasi — dipilih pas checkout (pola sama
-- persis referral_perw_id), MURNI tag, tidak ada perhitungan split
-- otomatis yang jalan dari kolom ini (kalkulasi & transfer ke rekening
-- pribadi jamaah tetap manual di luar sistem).
ALTER TABLE bookings
  ADD COLUMN referral_koperasi_id VARCHAR(36) NULL AFTER referral_perw_id;

CREATE INDEX idx_bookings_referral_koperasi ON bookings (referral_koperasi_id);
