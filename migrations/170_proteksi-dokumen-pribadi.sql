-- Migrasi path dokumen pribadi/legal yang SUDAH ADA di database, dari URL
-- statis lama (/uploads/<kategori>/...) ke endpoint terproteksi baru
-- (/api/dokumen/<kategori>/...) — dikonfirmasi user 2026-09-03: dokumen
-- KTP/paspor/KK/foto profil/bukti transfer/bukti TTD dsb harus digerbangi
-- login+kepemilikan di server, bukan cuma "URL-nya susah ditebak" kayak
-- selama ini. File fisiknya sendiri sudah dipindah manual dari
-- public/uploads/<kategori>/ ke private-uploads/<kategori>/ SEBELUM
-- migration ini dijalankan (lihat src/app/api/dokumen/[...slug]/route.js
-- utk logic pembacanya, src/lib/dokumenProteksi.js utk logic
-- kepemilikannya). Kategori yang SENGAJA TIDAK ikut (tetap publik apa
-- adanya): galeri, promo, kalkulator-template, perlengkapan-jamaah,
-- proposal-profile, pengaturan, kenapa-jm-travel, metode-pembayaran (semua
-- memang konten marketing yang ditampilkan bebas ke publik).
--
-- dokumen-signature (TTD digital + materai) SENGAJA belum ikut migrasi ini
-- — mekanisme penyimpanannya beda (bukan writeFile per-kategori sederhana),
-- perlu investigasi terpisah biar gak resiko ngerusak alur tanda tangan
-- digital yang lagi aktif dipakai.
--
-- Jalankan: mysql -u root -p jm_travel < migration-proteksi-dokumen-pribadi.sql

UPDATE users SET foto_ktp_path = REPLACE(foto_ktp_path, '/uploads/ktp/', '/api/dokumen/ktp/') WHERE foto_ktp_path LIKE '/uploads/ktp/%';
UPDATE users SET foto_path = REPLACE(foto_path, '/uploads/foto/', '/api/dokumen/foto/') WHERE foto_path LIKE '/uploads/foto/%';
UPDATE users SET formulir_pendaftaran_fisik_path = REPLACE(formulir_pendaftaran_fisik_path, '/uploads/formulir-fisik/', '/api/dokumen/formulir-fisik/') WHERE formulir_pendaftaran_fisik_path LIKE '/uploads/formulir-fisik/%';
UPDATE users SET dokumen_pks_fisik_path = REPLACE(dokumen_pks_fisik_path, '/uploads/dokumen-pks-fisik/', '/api/dokumen/dokumen-pks-fisik/') WHERE dokumen_pks_fisik_path LIKE '/uploads/dokumen-pks-fisik/%';

UPDATE agen_pendaftaran SET foto_ktp_path = REPLACE(foto_ktp_path, '/uploads/ktp/', '/api/dokumen/ktp/') WHERE foto_ktp_path LIKE '/uploads/ktp/%';

UPDATE koperasi_pendaftaran SET foto_ktp_path = REPLACE(foto_ktp_path, '/uploads/ktp/', '/api/dokumen/ktp/') WHERE foto_ktp_path LIKE '/uploads/ktp/%';
UPDATE koperasi_pendaftaran SET bukti_tf_path = REPLACE(bukti_tf_path, '/uploads/bukti-tf-koperasi/', '/api/dokumen/bukti-tf-koperasi/') WHERE bukti_tf_path LIKE '/uploads/bukti-tf-koperasi/%';
-- dokumen_spk_ak_fisik_path / dokumen_sk_cif_fisik_path / dokumen_surat_kuasa_cif_fisik_path
-- ternyata kolomnya di tabel `users`, BUKAN koperasi_pendaftaran (dicek ulang SHOW COLUMNS).
UPDATE users SET dokumen_spk_ak_fisik_path = REPLACE(dokumen_spk_ak_fisik_path, '/uploads/dokumen-koperasi-fisik/', '/api/dokumen/dokumen-koperasi-fisik/') WHERE dokumen_spk_ak_fisik_path LIKE '/uploads/dokumen-koperasi-fisik/%';
UPDATE users SET dokumen_sk_cif_fisik_path = REPLACE(dokumen_sk_cif_fisik_path, '/uploads/dokumen-koperasi-fisik/', '/api/dokumen/dokumen-koperasi-fisik/') WHERE dokumen_sk_cif_fisik_path LIKE '/uploads/dokumen-koperasi-fisik/%';
UPDATE users SET dokumen_surat_kuasa_cif_fisik_path = REPLACE(dokumen_surat_kuasa_cif_fisik_path, '/uploads/dokumen-koperasi-fisik/', '/api/dokumen/dokumen-koperasi-fisik/') WHERE dokumen_surat_kuasa_cif_fisik_path LIKE '/uploads/dokumen-koperasi-fisik/%';

UPDATE bookings SET jamaah_data = REPLACE(jamaah_data, '/uploads/dokumen-jamaah/', '/api/dokumen/dokumen-jamaah/') WHERE jamaah_data LIKE '%/uploads/dokumen-jamaah/%';
UPDATE bookings SET perjanjian_scan_path = REPLACE(perjanjian_scan_path, '/uploads/perjanjian-jamaah-scan/', '/api/dokumen/perjanjian-jamaah-scan/') WHERE perjanjian_scan_path LIKE '/uploads/perjanjian-jamaah-scan/%';

UPDATE invoice_kwitansi SET scan_fisik_path = REPLACE(scan_fisik_path, '/uploads/invoice-kwitansi-scan/', '/api/dokumen/invoice-kwitansi-scan/') WHERE scan_fisik_path LIKE '/uploads/invoice-kwitansi-scan/%';

UPDATE pembatalan SET refund_bukti_path = REPLACE(refund_bukti_path, '/uploads/bukti-refund/', '/api/dokumen/bukti-refund/') WHERE refund_bukti_path LIKE '/uploads/bukti-refund/%';

UPDATE payments SET bukti_path = REPLACE(bukti_path, '/uploads/bukti/', '/api/dokumen/bukti/') WHERE bukti_path LIKE '/uploads/bukti/%';

UPDATE komisi_ledger SET bukti_tf_admin_path = REPLACE(bukti_tf_admin_path, '/uploads/bukti-tf-komisi/', '/api/dokumen/bukti-tf-komisi/') WHERE bukti_tf_admin_path LIKE '/uploads/bukti-tf-komisi/%';

UPDATE pengajuan_ujroh SET bukti_ttd_path = REPLACE(bukti_ttd_path, '/uploads/bukti-ttd-ujroh/', '/api/dokumen/bukti-ttd-ujroh/') WHERE bukti_ttd_path LIKE '/uploads/bukti-ttd-ujroh/%';
UPDATE pengajuan_ujroh_perwakilan SET bukti_ttd_path = REPLACE(bukti_ttd_path, '/uploads/bukti-ttd-ujroh-perwakilan/', '/api/dokumen/bukti-ttd-ujroh-perwakilan/') WHERE bukti_ttd_path LIKE '/uploads/bukti-ttd-ujroh-perwakilan/%';
