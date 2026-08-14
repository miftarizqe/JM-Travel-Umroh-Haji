USE jm_travel;

-- 4 card "Kenapa JM Travel?" — sebelumnya hardcode icon+judul doang tanpa
-- isi. Sekarang bisa diklik buat buka modal (foto + deskripsi), sama pola
-- kayak Perlengkapan Jamaah & Skema Pembayaran.
CREATE TABLE IF NOT EXISTS kenapa_jm_travel (
  id INT PRIMARY KEY AUTO_INCREMENT,
  urutan INT NOT NULL,
  judul VARCHAR(100) NOT NULL,
  icon VARCHAR(10),
  deskripsi TEXT,
  gambar VARCHAR(255),
  aktif TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Deskripsi awal — "Izin Resmi" pakai nomor SK asli (sama kayak yang
-- tertulis di SPKA-Ins, lihat lib/pksIsi lama / dokumen_pasal). 3 lainnya
-- DRAFT umum, admin sebaiknya cek/lengkapi & tambahin foto asli.
INSERT INTO kenapa_jm_travel (urutan, judul, icon, deskripsi) VALUES
(1, 'Izin Resmi', '📋', 'PT. Alkhalid Jaya Megah Tours & Travel mengantongi izin resmi penyelenggara Umroh (SK PPIU No.921 Tahun 2017) dan Haji (SK PIHK No.35 Tahun 2019) dari Kementerian Agama RI.'),
(2, 'Hotel Premium', '🏨', 'Bekerja sama dengan hotel-hotel berkualitas di Mekkah dan Madinah, dekat dengan Masjidil Haram dan Masjid Nabawi — detail hotel per paket ada di halaman masing-masing program.'),
(3, 'Pembimbing', '👨‍🏫', 'Didampingi pembimbing (mutawwif) berpengalaman yang membimbing manasik dan ibadah Anda selama perjalanan.'),
(4, 'Layanan Personal', '🤝', 'Setiap jamaah didampingi lewat grup WhatsApp resmi sejak keberangkatan hingga kepulangan — pertanyaan dan kebutuhan Anda direspons langsung oleh tim kami, bukan sistem otomatis.');

-- Pill "Fasilitas All-In" — sebelumnya array hardcode di kode.
CREATE TABLE IF NOT EXISTS fasilitas_all_in (
  id INT PRIMARY KEY AUTO_INCREMENT,
  urutan INT NOT NULL,
  teks VARCHAR(100) NOT NULL,
  icon VARCHAR(10),
  aktif TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO fasilitas_all_in (urutan, teks, icon) VALUES
(1, 'Tiket Pesawat PP', '✈️'),
(2, 'Visa Umroh', '🛂'),
(3, 'Transportasi', '🚌'),
(4, 'Bagasi 2×23 Kg', '🧳'),
(5, 'Zamzam 5L', '💧'),
(6, 'Al Baik', '🍗'),
(7, 'Full Handling Airport', '🛬');
