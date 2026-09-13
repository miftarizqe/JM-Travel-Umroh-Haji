-- Kategori pengeluaran/pemasukan untuk cashflow ledger — konfigurable lewat UI
-- (sama seperti cashflow_akun), bukan enum tetap, biar bisa nambah/ubah sendiri
-- tanpa perlu migration tiap kali. Dipakai buat nandain "duit CIMB ini keluar
-- buat apa" (gaji, sewa, vendor, komisi, dst), terpisah dari kategori opex di
-- pengeluaran_operasional (laporan Keuangan Perusahaan yang akrual).
CREATE TABLE IF NOT EXISTS cashflow_kategori (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(100) NOT NULL,
  tipe ENUM('in','out') NOT NULL DEFAULT 'out',
  urutan INT NOT NULL DEFAULT 0,
  aktif TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE cashflow_transaksi
  ADD COLUMN kategori_id INT NULL AFTER deskripsi,
  ADD INDEX (kategori_id),
  ADD FOREIGN KEY (kategori_id) REFERENCES cashflow_kategori(id);

INSERT INTO cashflow_kategori (nama, tipe, urutan) VALUES
  ('Gaji & Tunjangan Karyawan', 'out', 1),
  ('Sewa Kantor', 'out', 2),
  ('Marketing/Iklan', 'out', 3),
  ('Utilitas (Listrik, Internet, Air)', 'out', 4),
  ('Operasional Kantor (ATK, dll)', 'out', 5),
  ('Sistem/Teknologi (Hosting, WA API, dll)', 'out', 6),
  ('Legal & Perizinan', 'out', 7),
  ('Pembayaran Vendor/HPP (Hotel, Maskapai)', 'out', 8),
  ('Komisi/Ujroh Agen', 'out', 9),
  ('Lain-lain', 'out', 10),
  ('Pendapatan Booking (DP/Pelunasan)', 'in', 1),
  ('Pendapatan Lain (Merchandise, dll)', 'in', 2),
  ('Modal/Setoran Pemilik', 'in', 3),
  ('Lain-lain', 'in', 4);
