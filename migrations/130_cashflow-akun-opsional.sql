-- Cashflow Bulanan awalnya SELALU nempel ke 1 akun bank/cash yang direkonsiliasi
-- (saldo awal->akhir balance). Tapi ada kelas transaksi yang BENERAN kejadian
-- (bon dari owner buat vendor program, atau belanja perlengkapan) TAPI gak
-- lewat rekening yang kita track sama sekali — dipaksa pilih akun cuma bikin
-- data ngawur (akun itu gak akan pernah balance beneran).
--
-- akun_id sekarang OPSIONAL: NULL = transaksi "purchasing/realisasi" murni
-- (dicatat buat kebutuhan Laba Rugi & Realisasi vs Budget, BUKAN bagian dari
-- rekonsiliasi saldo bulanan akun manapun) — lihat halaman /admin/purchasing.
-- Transaksi yang akun_id-nya keisi tetap kayak sebelumnya (ikut hitungan
-- saldo per akun), gak ada perubahan perilaku buat data lama.
ALTER TABLE cashflow_transaksi MODIFY COLUMN akun_id INT NULL;

-- Kategori baru khusus belanja perlengkapan jamaah (WMS) — sebelumnya
-- (migration-perlengkapan-harga.sql) baris cashflow otomatis dari stok masuk
-- gak punya kategori sama sekali, jadi gak ikut kehitung sebagai opex di
-- Laba Rugi Perusahaan. Sekarang punya kategori sendiri (BUKAN "Pembayaran
-- Vendor/HPP" — itu khusus hotel/maskapai, jangan ketuker, lihat
-- adalah_hpp_vendor) yang termasuk_laba_rugi=1, otomatis kehitung sebagai
-- opex biasa.
INSERT INTO cashflow_kategori (nama, tipe, termasuk_laba_rugi, adalah_hpp_vendor, urutan)
VALUES ('Perlengkapan Jamaah', 'out', 1, 0, 100);
