-- 1 jamaah = 1 perjanjian = 1 nomor surat (dikonfirmasi user 2026-10-18,
-- gantiin skema lama 1 nomor dipakai bareng semua jamaah dalam 1 booking).
-- bookings.no_perjanjian_jamaah TETAP ADA (nomor lama yang udah kebeku
-- gak diubah retroaktif) tapi gak dipakai lagi buat nomor BARU -- nomor
-- baru disimpan per (booking_id, jamaah_idx) di sini karena jamaah_data
-- cuma JSON, entry-nya gak punya primary key sendiri buat ditempelin kolom.
CREATE TABLE perjanjian_jamaah_nomor (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id VARCHAR(20) NOT NULL,
  jamaah_idx INT NOT NULL,
  nomor VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_booking_jamaah (booking_id, jamaah_idx)
);
