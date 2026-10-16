-- Basis akrual ditambahin sebagai mode BARU di Laba Rugi (lihat
-- hitungLaporanKeuanganProgram & hitungLaporanKeuanganPerusahaan di
-- src/lib/laporanKeuangan*.js) tanpa ganti yang lama — 1 periode kalender
-- sekarang bisa punya SAMPAI 2 snapshot independen (kas & akrual),
-- masing-masing bisa dikunci/dibuka terpisah (dikonfirmasi user 2026-10-16).
--
-- Baris LAMA (pra-fitur ini) semuanya hasil hitungan basis kas (satu-satunya
-- mode yang ada saat itu) -> dibackfill 'kas', BUKAN default kolom baru
-- ('akrual'), biar nilai historisnya gak berubah arti.
--
-- Unique index lama bernama 'periode' (verified via SHOW INDEX di DB lokal,
-- single-column UNIQUE auto-named oleh MySQL) -- kalau di VPS ternyata beda
-- nama, cek dulu pakai SHOW INDEX FROM laba_rugi_periode sebelum jalanin ini.
--
-- Jalankan sekali di MySQL, database: jm_travel

ALTER TABLE laba_rugi_periode
  ADD COLUMN basis ENUM('kas','akrual') NOT NULL DEFAULT 'akrual' AFTER tipe;

UPDATE laba_rugi_periode SET basis = 'kas';

ALTER TABLE laba_rugi_periode
  DROP INDEX periode,
  ADD UNIQUE KEY uniq_periode_basis (periode, basis);
