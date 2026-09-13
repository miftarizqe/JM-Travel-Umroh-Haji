-- Closing Langsung Sahabat Baitullah buat jamaah LAIN (ajak orang tapi
-- orangnya malah booking program reguler/publik, bukan jadi gabung Sahabat
-- Baitullah) direstruktur (dikonfirmasi user 2026-09-06):
--   - Closer (anggota Sahabat Baitullah) dapet FIXED Rp1.000.000 PERMANEN
--     (bukan persentase lagi) — dianggap pengganti voucher Rp1jt yang gak
--     dia dapet karena orang yang diajak gak jadi gabung.
--   - Head of Program dapet nominal PER-PROGRAM (diisi admin pas bikin
--     Costing Program, direkomendasikan dari setting global lama sebagai
--     default), bukan 1 angka global doang lintas semua program.
-- Skenario self-checkout (booking buat diri sendiri) TIDAK berubah, tetap
-- pakai persen dari pengaturan.komisi_sahabat_closing_persen.
--
-- Jalankan: mysql -u root -p jm_travel < migration-sahabat-closing-langsung-per-program.sql

ALTER TABLE programs ADD COLUMN sahabat_closing_langsung_hop_nominal BIGINT NULL
  COMMENT 'Nominal fix Head of Program per-program buat closing langsung Sahabat Baitullah ke jamaah lain (NULL = pakai fallback pengaturan.sahabat_closing_langsung_hop_nominal).';
