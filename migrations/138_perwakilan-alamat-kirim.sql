-- Alamat pengiriman (dipakai kalau calon perwakilan pilih metode "Kirim
-- Paket" — JM Travel mengirim Perjanjian Kerjasama ke alamat ini, lihat
-- /daftar-perwakilan/metode). Disimpan di agen_pendaftaran (snapshot
-- pendaftaran) DAN users (dipakai status-pendaftaran/page.jsx nampilin
-- alamat tujuan, sama pola dgn alamat_ktp/alamat_domisili yang juga di-dupe).
ALTER TABLE agen_pendaftaran ADD COLUMN alamat_kirim VARCHAR(500) NULL AFTER alamat_domisili;
ALTER TABLE users ADD COLUMN alamat_kirim VARCHAR(500) NULL AFTER alamat_domisili;
