USE jm_travel;

-- Pengaturan umum (kontak, rekening, alamat, sosmed) — SATU baris config,
-- dipakai semua halaman marketing/transaksi (landing page, checkout,
-- pelunasan, verifikasi, dst) biar gak perlu ubah kode kalau nomor/rekening
-- ganti. SENGAJA TIDAK dipakai di teks pasal SPKA/SPKA-Ins/SPKL (lihat
-- src/lib/pksIsi.jsx) — itu transkrip persis dokumen yang sudah
-- ditandatangani, rekening yang disebut di situ harus tetap sesuai versi
-- yang ditandatangani, bukan ikut berubah otomatis.
CREATE TABLE IF NOT EXISTS pengaturan (
  id INT PRIMARY KEY DEFAULT 1,
  wa_kantor VARCHAR(20),
  bank_nama VARCHAR(100),
  bank_rekening VARCHAR(50),
  bank_atas_nama VARCHAR(100),
  alamat_kantor VARCHAR(255),
  ig_url VARCHAR(255),
  tiktok_url VARCHAR(255),
  fb_url VARCHAR(255),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed dengan nilai REAL yang sekarang udah ke-hardcode di banyak file, biar
-- migrasi ke sistem baru ini gak mengubah tampilan apa pun buat pengunjung.
INSERT INTO pengaturan (id, wa_kantor, bank_nama, bank_rekening, bank_atas_nama, alamat_kantor, ig_url, tiktok_url, fb_url)
VALUES (
  1,
  '6282310572050',
  'Bank Syariah Indonesia',
  '7133-0541-24',
  'Alkhalid Jaya Megah',
  'Jl. Panglima Polim Raya No. 21 C, Kebayoran Baru, Jakarta Selatan 12160',
  'https://www.instagram.com/jm.tourtravel/',
  'https://www.tiktok.com/@jm.tourtravel',
  'https://www.facebook.com/jayamegahtour'
)
ON DUPLICATE KEY UPDATE id = id;
