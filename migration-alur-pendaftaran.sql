USE jm_travel;

-- Alur pendaftaran umroh (step-by-step journey) — ditampilkan di landing
-- page SEBELUM section Program, biar pengunjung ngerti gambaran besar
-- prosesnya dulu sebelum milih paket. SENGAJA singkat per step (mis. "DP
-- Rp 5.000.000" tanpa rincian skema) — detail cara bayar ada di
-- skema_pembayaran, section terpisah, biar gak dobel & gak bikin
-- step ini kepanjangan buat dibaca sekilas.
CREATE TABLE IF NOT EXISTS alur_pendaftaran (
  id INT PRIMARY KEY AUTO_INCREMENT,
  urutan INT NOT NULL,
  judul VARCHAR(100) NOT NULL,
  deskripsi VARCHAR(255) NOT NULL,
  icon VARCHAR(10),          -- emoji, opsional
  aktif TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO alur_pendaftaran (urutan, judul, deskripsi, icon) VALUES
(1, 'Pilih Program', 'Pilih paket umroh yang paling sesuai kebutuhan dan jadwal Anda.', '🕌'),
(2, 'DP Rp 5.000.000', 'Bayar DP untuk mengunci slot keberangkatan Anda.', '💳'),
(3, 'Perlengkapan Dikirim', 'Perlengkapan jamaah dikirim langsung ke rumah Anda.', '🎒'),
(4, 'Manasik Umroh', 'Ikuti manasik untuk persiapan ibadah Anda.', '📖'),
(5, 'Keberangkatan', 'Berangkat menuju Baitullah bersama JM Travel.', '✈️');
