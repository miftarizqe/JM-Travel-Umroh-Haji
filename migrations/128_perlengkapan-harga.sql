-- Biaya belanja stok perlengkapan (restock) — sebelumnya WMS cuma nyatet
-- qty/status kirim, sama sekali gak ada nominal, jadi belanja perlengkapan
-- gak pernah kecatat sebagai pengeluaran di mana pun (lihat PR finance:
-- integrasi cashflow + realisasi budget per program).
--
-- harga_satuan cuma keisi buat baris tipe='in' (pembelian), NULL buat baris
-- 'out' (pengiriman kit ke jamaah — bukan transaksi uang baru).
-- cashflow_transaksi_id (opsional) = link ke baris cashflow yang OTOMATIS
-- dibikin bareng pas admin isi harga_satuan + pilih akun sumber dana, biar
-- belanja ini kehitung juga di laporan keuangan — lihat tambahStokMasuk()
-- di src/lib/perlengkapan.js. NULL kalau admin gak pilih akun (cuma nyatet
-- harga referensi doang, gak dianggap transaksi cashflow).
--
-- Jalankan sekali di MySQL, database: jm_travel

ALTER TABLE perlengkapan_stok_ledger
  ADD COLUMN harga_satuan BIGINT NULL AFTER qty,
  ADD COLUMN cashflow_transaksi_id INT NULL,
  ADD INDEX (cashflow_transaksi_id),
  ADD FOREIGN KEY (cashflow_transaksi_id) REFERENCES cashflow_transaksi(id);
