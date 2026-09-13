-- ============================================
-- MIGRATION: Pembatalan per-jamaah (bukan cuma per-booking)
--
-- Booking bisa isi lebih dari 1 jamaah — kadang cuma 1 orang yang batal,
-- bukan semuanya. jamaah_idx NULL (default) = pembatalan booking utuh
-- (perilaku lama, TIDAK BERUBAH). jamaah_idx terisi = pembatalan 1 jamaah
-- spesifik di dalam booking itu (index array bookings.jamaah_data).
--
-- Jalankan sekali di MySQL, database: jm_travel
-- ============================================

ALTER TABLE pembatalan
  ADD COLUMN jamaah_idx INT NULL AFTER booking_id;
