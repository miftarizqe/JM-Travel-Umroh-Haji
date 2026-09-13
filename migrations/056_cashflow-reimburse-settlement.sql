-- Kaitkan klaim reimburse ke settlement asalnya — dipakai kalau rincian
-- belanja staff dari settlement ternyata LEBIH BESAR dari uang yang
-- ditransfer company (staff nombokin pakai duit sendiri). Kelebihannya
-- otomatis jadi klaim reimburse (lihat /api/admin/cashflow/reimburse), dan
-- kolom ini yang jadi penanda "settlement ini sudah dialihkan ke reimburse"
-- biar reminder saat submit gak nanya berulang-ulang buat settlement yang
-- sama.
ALTER TABLE cashflow_reimburse
  ADD COLUMN dari_settlement_id INT NULL AFTER nama_staff,
  ADD FOREIGN KEY (dari_settlement_id) REFERENCES cashflow_transaksi(id);
