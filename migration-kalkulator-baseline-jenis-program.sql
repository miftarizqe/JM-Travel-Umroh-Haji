-- ============================================
-- MIGRATION: Umroh Private — baseline per jenis program
--
-- Sebelumnya Kalkulator Estimasi Publik cuma nawarin paket yang dikurasi
-- admin (nama+foto+deskripsi, mis. "Umroh Berdua") — kalau belum ada paket
-- yang cocok, pengunjung mentok di "Belum ada paket". Sekarang ada jalur
-- kedua: "Umroh Private" — pengunjung langsung pilih JENIS PROGRAM (Umroh
-- Regular/Umroh Plus/Wisata Muslim/dst, dari JENIS_PROGRAM_LIST yang sama
-- dipakai KalkulatorTerpadu), lalu isi semua preferensinya sendiri dari
-- baseline rate standar (bukan nempel ke 1 paket marketing tertentu).
--
-- `tipe` bedain baris kurasi (paket bernama, browse dari daftar) vs baseline
-- (1 per jenis_program, di-lookup by jenis_program bukan browse). Baseline
-- TETAP baris kalkulator_template_publik biasa — config_json, admin editor
-- (KalkulatorTerpadu), dan alur hitung/ajukan di publik SEMUANYA reuse
-- persis sama, gak ada logic baru di situ.
--
-- Jalankan sekali di MySQL, database: jm_travel
-- ============================================

ALTER TABLE kalkulator_template_publik
  ADD COLUMN tipe ENUM('kurasi','baseline') NOT NULL DEFAULT 'kurasi' AFTER nama,
  ADD COLUMN jenis_program VARCHAR(30) NULL AFTER tipe,
  ADD UNIQUE KEY uniq_baseline_jenis_program (jenis_program);
