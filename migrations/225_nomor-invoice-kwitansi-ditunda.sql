-- Nomor TTU/Kwitansi SELAMA INI dibakar (generateNomor...) begitu baris
-- invoice_kwitansi dibuat -- yaitu pas payment di-approve admin, JAUH
-- sebelum dokumennya beneran dilihat/diprint/dikirim. Kalau TTU-nya gak
-- pernah diproses lanjut (admin lupa, atau payment-nya ternyata keliru),
-- nomor itu tetap kebakar & gak pernah kepake -- beda dari pola SPJ/SPKA-Ins
-- (nomorSurat.js) yang baru bakar nomor pas halaman cetak PERTAMA dibuka.
--
-- Disepakati user 2026-10-14: nomor TTU/Kwitansi baru dibakar pas
-- BENERAN "kepake" -- buat dokumen yang WAJIB materai (>Rp5jt), itu pas
-- pertama kali halaman cetak dibuka (karena dari situ udah bisa langsung
-- diprint fisik); buat yang GAK wajib materai (self-certify), itu pas
-- tombol "Kirim ke Jamaah" diklik. nomor jadi NULLABLE biar baris
-- invoice_kwitansi bisa dibuat duluan tanpa nomor dulu.
ALTER TABLE invoice_kwitansi
  MODIFY COLUMN nomor VARCHAR(50) NULL;
