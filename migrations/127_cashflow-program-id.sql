-- Tag opsional 1 transaksi cashflow ke 1 program (mis. "Pembayaran Vendor/HPP"
-- yang keluar buat program Umroh Berdua batch Oktober) — fondasi buat laporan
-- Realisasi vs Budget per Program (bandingin duit yang BENERAN keluar/masuk
-- lewat cashflow_transaksi vs HPP budget di biaya_breakdown/programs.hpp_*).
--
-- Nullable & gak wajib diisi — transaksi company-wide (gaji, sewa, dst) yang
-- emang gak nempel ke program manapun tetap boleh kosong, perilaku existing
-- gak berubah sama sekali.
--
-- Jalankan sekali di MySQL, database: jm_travel

ALTER TABLE cashflow_transaksi
  ADD COLUMN program_id VARCHAR(36) NULL AFTER kategori_id,
  ADD INDEX (program_id),
  ADD FOREIGN KEY (program_id) REFERENCES programs(id);
