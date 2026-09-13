-- Tandai eksplisit kategori mana yang representasi HPP vendor REAL (bukan
-- cocokin nama teks yang bisa admin ubah kapan aja lewat UI kategori) —
-- dipakai hitungLaporanKeuanganPerusahaan() buat HPP di Laba Rugi Perusahaan,
-- gantiin angka budget (programs.hpp_* × pax booking) dengan duit yang
-- BENERAN dibayar ke vendor (lihat migration-cashflow-kategori-laba-rugi.sql
-- — kategori id 8 ini emang udah di-exclude dari loop opex generik dari
-- awal, "akan dihitung otomatis dari sumber lain", sekarang baru beneran
-- diimplementasi).
--
-- Jalankan sekali di MySQL, database: jm_travel

ALTER TABLE cashflow_kategori
  ADD COLUMN adalah_hpp_vendor TINYINT NOT NULL DEFAULT 0 AFTER termasuk_laba_rugi;

UPDATE cashflow_kategori SET adalah_hpp_vendor = 1 WHERE id = 8;
