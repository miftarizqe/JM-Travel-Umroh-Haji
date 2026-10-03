-- Komponen alamat KTP tersimpan terpisah (dikonfirmasi user 2026-10-03) --
-- sebelumnya cuma hasil gabungan (alamat_ktp, string tunggal "jalan, no,
-- rt, rw, kel, kec, kota, provinsi, negara") yang kesimpen, komponen
-- aslinya dibuang begitu di-join. Dibutuhkan biar dokumen (Perjanjian
-- Kerjasama Perwakilan, SPK-AK, dst) bisa nampilin alamat terstruktur
-- (mis. "Nama Jalan :", "No Rumah : No. X", "RT/RW : RT Y/RW Z") alih-alih
-- 1 baris gabungan. Cuma KTP (bukan domisili) karena cuma itu yang dipakai
-- dokumen legal -- "Surat pakai alamat KTP (data resmi)" (lihat
-- src/app/api/admin/cetak-pks/[user_id]/route.js). Data lama (sudah
-- terjoin) TIDAK bisa di-backfill akurat ke kolom ini (join pakai
-- .filter(Boolean) jadi posisi koma gak bisa dipetakan balik per-bagian).
ALTER TABLE users
  ADD COLUMN alamat_ktp_jalan VARCHAR(255) NULL AFTER alamat_ktp,
  ADD COLUMN alamat_ktp_no_rumah VARCHAR(50) NULL AFTER alamat_ktp_jalan,
  ADD COLUMN alamat_ktp_rt VARCHAR(10) NULL AFTER alamat_ktp_no_rumah,
  ADD COLUMN alamat_ktp_rw VARCHAR(10) NULL AFTER alamat_ktp_rt,
  ADD COLUMN alamat_ktp_kelurahan VARCHAR(100) NULL AFTER alamat_ktp_rw,
  ADD COLUMN alamat_ktp_kecamatan VARCHAR(100) NULL AFTER alamat_ktp_kelurahan,
  ADD COLUMN alamat_ktp_kota VARCHAR(100) NULL AFTER alamat_ktp_kecamatan,
  ADD COLUMN alamat_ktp_provinsi VARCHAR(100) NULL AFTER alamat_ktp_kota,
  ADD COLUMN alamat_ktp_negara VARCHAR(100) NULL AFTER alamat_ktp_provinsi;
