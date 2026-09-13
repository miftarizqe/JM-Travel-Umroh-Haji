-- Buku kas bulanan multi-akun (CIMB, Cash/Petty Cash, Flazz, dst) — pengganti
-- pendekatan "Arus Kas" lama yang cuma nurunin angka dari booking+opex.
-- Ini adalah ledger manual: tiap baris = 1 transaksi nyata di 1 akun, saldo
-- akhir bulan dikunci saat submit dan jadi saldo awal bulan berikutnya.

CREATE TABLE IF NOT EXISTS cashflow_akun (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(50) NOT NULL,
  tipe ENUM('bank','cash','emoney','lainnya') NOT NULL DEFAULT 'lainnya',
  urutan INT NOT NULL DEFAULT 0,
  aktif TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cashflow_periode (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bulan CHAR(7) NOT NULL UNIQUE,
  status ENUM('draft','submitted') NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMP NULL,
  submitted_by VARCHAR(36) NULL,
  created_by VARCHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cashflow_saldo_awal (
  periode_id INT NOT NULL,
  akun_id INT NOT NULL,
  saldo_awal BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (periode_id, akun_id),
  FOREIGN KEY (periode_id) REFERENCES cashflow_periode(id),
  FOREIGN KEY (akun_id) REFERENCES cashflow_akun(id)
);

CREATE TABLE IF NOT EXISTS cashflow_transaksi (
  id INT AUTO_INCREMENT PRIMARY KEY,
  periode_id INT NOT NULL,
  tanggal DATE NOT NULL,
  deskripsi VARCHAR(255) NOT NULL,
  akun_id INT NOT NULL,
  tipe ENUM('in','out') NOT NULL,
  nominal BIGINT NOT NULL,
  bukti_path VARCHAR(255) NULL,
  bukti_nama VARCHAR(255) NULL,
  transfer_pair_id VARCHAR(36) NULL,
  is_settlement TINYINT NOT NULL DEFAULT 0,
  penerima_settlement VARCHAR(150) NULL,
  settlement_induk_id INT NULL,
  input_oleh VARCHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (periode_id),
  INDEX (akun_id),
  INDEX (settlement_induk_id),
  FOREIGN KEY (periode_id) REFERENCES cashflow_periode(id),
  FOREIGN KEY (akun_id) REFERENCES cashflow_akun(id),
  FOREIGN KEY (settlement_induk_id) REFERENCES cashflow_transaksi(id)
);

-- Akun default sesuai contoh laporan yang sudah dipakai (bisa ditambah/diedit lewat UI)
INSERT INTO cashflow_akun (nama, tipe, urutan) VALUES
  ('CIMB', 'bank', 1),
  ('Cash', 'cash', 2),
  ('Flazz', 'emoney', 3);
