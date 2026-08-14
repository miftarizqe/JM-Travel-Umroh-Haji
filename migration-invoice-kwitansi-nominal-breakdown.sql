-- Kwitansi Pembayaran: TOTAL LUNAS-nya harus jumlah yang BENERAN diterima
-- (DP aktual + Pelunasan aktual dari tabel payments, termasuk kode_unik
-- reconciliation), bukan booking.total_harga (harga target/kontrak) —
-- dua-duanya bisa beda dikit. Disimpan permanen di sini (bukan dihitung
-- ulang tiap cetak) biar kwitansi yang udah terbit gak berubah angkanya
-- kalau data booking ke-update belakangan.
ALTER TABLE invoice_kwitansi
  ADD COLUMN nominal_dp BIGINT NULL,
  ADD COLUMN nominal_pelunasan BIGINT NULL;
