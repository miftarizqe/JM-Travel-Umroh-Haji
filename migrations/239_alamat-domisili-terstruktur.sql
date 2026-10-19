-- Alamat Domisili sekarang punya kolom terstruktur juga (mirror alamat_ktp_*)
-- -- dikonfirmasi user 2026-10-19. Sebelumnya domisili CUMA disimpan sebagai
-- 1 kolom teks gabungan (alamat_domisili), komponen aslinya (jalan/no rumah/
-- RT-RW/kelurahan/kecamatan/kota/provinsi) dibuang begitu digabung jadi
-- string -- gak bisa dipecah balik buat prefill dropdown berjenjang
-- AddressFields (mis. checkbox "Salin dari Alamat Domisili" di checkout).
ALTER TABLE users
  ADD COLUMN alamat_domisili_jalan VARCHAR(255) NULL AFTER alamat_domisili,
  ADD COLUMN alamat_domisili_no_rumah VARCHAR(50) NULL AFTER alamat_domisili_jalan,
  ADD COLUMN alamat_domisili_rt VARCHAR(10) NULL AFTER alamat_domisili_no_rumah,
  ADD COLUMN alamat_domisili_rw VARCHAR(10) NULL AFTER alamat_domisili_rt,
  ADD COLUMN alamat_domisili_kelurahan VARCHAR(100) NULL AFTER alamat_domisili_rw,
  ADD COLUMN alamat_domisili_kecamatan VARCHAR(100) NULL AFTER alamat_domisili_kelurahan,
  ADD COLUMN alamat_domisili_kota VARCHAR(100) NULL AFTER alamat_domisili_kecamatan,
  ADD COLUMN alamat_domisili_provinsi VARCHAR(100) NULL AFTER alamat_domisili_kota,
  ADD COLUMN alamat_domisili_negara VARCHAR(100) NULL AFTER alamat_domisili_provinsi,
  ADD COLUMN alamat_domisili_kode_pos VARCHAR(10) NULL AFTER alamat_domisili_negara;

-- Backfill akun EXISTING yang domisilinya "sama dengan KTP" (terdeteksi
-- dari alamat_domisili === alamat_ktp, pola yang sama dipakai
-- src/app/api/daftar-sahabat/route.js & daftar-perwakilan/route.js buat
-- infer sama_ktp) -- komponen KTP-nya udah ada & identik, aman disalin.
-- Akun yang domisilinya BEDA dari KTP TIDAK kebawa (datanya emang gak
-- pernah tersimpan terstruktur sebelum migration ini, gak bisa direkonstruksi).
UPDATE users SET
  alamat_domisili_jalan = alamat_ktp_jalan,
  alamat_domisili_no_rumah = alamat_ktp_no_rumah,
  alamat_domisili_rt = alamat_ktp_rt,
  alamat_domisili_rw = alamat_ktp_rw,
  alamat_domisili_kelurahan = alamat_ktp_kelurahan,
  alamat_domisili_kecamatan = alamat_ktp_kecamatan,
  alamat_domisili_kota = alamat_ktp_kota,
  alamat_domisili_provinsi = alamat_ktp_provinsi,
  alamat_domisili_negara = alamat_ktp_negara,
  alamat_domisili_kode_pos = kode_pos
WHERE alamat_domisili IS NOT NULL AND alamat_ktp IS NOT NULL
  AND alamat_domisili = alamat_ktp AND alamat_ktp_jalan IS NOT NULL;
