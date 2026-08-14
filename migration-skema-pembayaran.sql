USE jm_travel;

-- Skema/cara pembayaran yang ditawarkan JM Travel — ISI BEDA sama
-- metode_pembayaran (itu soal REKENING TUJUAN transfer). Ini soal PILIHAN
-- SKEMA: lunas/DP+pelunasan, tabungan umroh, jadi mitra buat umroh gratis,
-- cicilan syariah, dst. Murni konten (gak ada logic sistem baru) — CTA-nya
-- selalu ke WhatsApp kantor (lihat pengaturan.wa_kantor), bukan checkout
-- otomatis, karena skema ini ditangani manual/offline.
CREATE TABLE IF NOT EXISTS skema_pembayaran (
  id INT PRIMARY KEY AUTO_INCREMENT,
  urutan INT NOT NULL,
  judul VARCHAR(150) NOT NULL,
  deskripsi TEXT NOT NULL,
  pesan_wa VARCHAR(255),   -- pesan WA custom pas klik CTA, kosong = pakai default generik
  aktif TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO skema_pembayaran (urutan, judul, deskripsi, pesan_wa) VALUES
(1, 'Bayar Lunas atau DP + Pelunasan',
 'Bisa bayar lunas di awal, atau DP Rp 5.000.000 dulu — begitu DP dikonfirmasi, perlengkapan jamaah langsung dikirimkan, lalu pelunasan dibayarkan sebelum keberangkatan.',
 'Assalamu''alaikum JM Travel, saya ingin tanya soal skema Bayar Lunas / DP + Pelunasan.'),
(2, 'Tabungan Umroh',
 'Buka tabungan khusus umroh di BSI, menabung rutin dengan dana terkunci, dan cair begitu tabungannya sudah cukup untuk membeli paket umroh pilihan Anda.',
 'Assalamu''alaikum JM Travel, saya ingin tanya soal Tabungan Umroh.'),
(3, 'Umroh Gratis Jadi Mitra JM Travel',
 'Bergabung sebagai agen dan dapatkan ujroh dari setiap closing — sebagian otomatis masuk tabungan yang bisa jadi modal keberangkatan Anda sendiri. Berhasil membawa cukup banyak jamaah, Anda naik jadi Tour Leader: umroh gratis dibayarkan kantor, plus fee Tour Leader.',
 'Assalamu''alaikum JM Travel, saya ingin tanya soal jadi Mitra/Agen JM Travel.'),
(4, 'Cicilan Syariah bersama Amitra Syariah',
 'Bayar dengan cicilan yang sepenuhnya syariah, lewat kerja sama kami dengan Amitra Syariah.',
 'Assalamu''alaikum JM Travel, saya ingin tanya soal Cicilan Syariah bersama Amitra Syariah.');

-- Daftar perlengkapan yang dikirim ke jamaah setelah DP dikonfirmasi —
-- SENGAJA dikosongin (bukan diisi contoh karangan), admin isi sendiri item
-- aslinya lewat /admin/pengaturan/perlengkapan.
CREATE TABLE IF NOT EXISTS perlengkapan_jamaah (
  id INT PRIMARY KEY AUTO_INCREMENT,
  urutan INT NOT NULL,
  nama VARCHAR(150) NOT NULL,
  deskripsi VARCHAR(255),
  aktif TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
