USE jm_travel;

CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  wa VARCHAR(20) UNIQUE NOT NULL,
  nik VARCHAR(16) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('jamaah','agen','perwakilan','admin') NOT NULL,
  kode_unik VARCHAR(20) UNIQUE,
  kode_unik_alias VARCHAR(20),
  status ENUM('active','pending','rejected') DEFAULT 'active',
  wilayah VARCHAR(100),
  points INT DEFAULT 0,
  tabungan_bsi BIGINT DEFAULT 0,
  perekrut_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE programs (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(150) NOT NULL,
  type VARCHAR(50),
  durasi INT,
  tanggal VARCHAR(100),
  total_seat INT DEFAULT 20,
  used_seat INT DEFAULT 0,
  dp BIGINT,
  hpp_perw BIGINT,
  harga_deluxe BIGINT,
  harga_eksekutif BIGINT,
  harga_signature BIGINT,
  ujroh_deluxe BIGINT,
  ujroh_eksekutif BIGINT,
  ujroh_signature BIGINT,
  highlight VARCHAR(255),
  publish_type ENUM('public','perwakilan') DEFAULT 'public',
  perw_id VARCHAR(36),
  active TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bookings (
  id VARCHAR(20) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  prog_id VARCHAR(36) NOT NULL,
  prog_name VARCHAR(150),
  paket ENUM('deluxe','eksekutif','signature'),
  kamar VARCHAR(50),
  jumlah_jamaah INT DEFAULT 1,
  dp_amount BIGINT,
  kode_unik_dp INT,
  dp_status ENUM('pending','confirmed','rejected') DEFAULT 'pending',
  total_harga BIGINT,
  pelunasan_status ENUM('unpaid','pending_confirm','paid') DEFAULT 'unpaid',
  form_filled INT DEFAULT 0,
  form_total INT DEFAULT 1,
  sumber_info VARCHAR(50),
  referral_kode VARCHAR(50),
  referral_agen_id VARCHAR(36),
  referral_perw_id VARCHAR(36),
  status ENUM('active','selesai','batal') DEFAULT 'active',
  ordered_by VARCHAR(36),
  ordered_by_role VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  booking_id VARCHAR(20),
  user_id VARCHAR(36),
  nama VARCHAR(100),
  type ENUM('dp','lunas'),
  amount BIGINT,
  kode_unik INT,
  status ENUM('pending','confirmed','rejected') DEFAULT 'pending',
  reject_reason VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vouchers (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  kode VARCHAR(50) UNIQUE NOT NULL,
  potongan BIGINT,
  for_user VARCHAR(36),
  valid_until DATE,
  used TINYINT DEFAULT 0,
  catatan VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);