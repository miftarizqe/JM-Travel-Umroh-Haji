USE jm_travel;

-- Teks statis landing page (headline, tagline, deskripsi section, dst) yang
-- SEBELUMNYA hardcode di page.tsx — sekarang jadi key-value biar admin bisa
-- edit semua tanpa nyentuh kode. Kolom `nilai` yang isinya "list" (mis.
-- kemitraan_agen_items) pakai konvensi 1 baris = 1 item, di-split '\n' pas
-- dirender. SENGAJA gak bikin tabel terpisah per section (bakal kebanyakan
-- tabel buat hal sesederhana teks) — 1 tabel generik lebih gampang dirawat.
-- Label butuh nama (Nama Perusahaan dsb) TIDAK dimasukkan sini, itu masih
-- di tabel `pengaturan` (Pengaturan Umum) biar gak dobel sumber kebenaran.
CREATE TABLE IF NOT EXISTS landing_page_teks (
  kunci VARCHAR(100) PRIMARY KEY,
  grup VARCHAR(50) NOT NULL,
  label VARCHAR(150) NOT NULL,
  nilai TEXT NOT NULL,
  multiline TINYINT(1) DEFAULT 0,  -- true = textarea + hint "1 baris = 1 item" di form admin
  urutan INT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO landing_page_teks (kunci, grup, label, nilai, multiline, urutan) VALUES
-- HERO
('hero_badge', 'Hero', 'Badge Kecil di Atas Judul', '✨ Perjalanan Ibadah Eksklusif', 0, 1),
('hero_headline', 'Hero', 'Judul Utama (baris 1 & 2, baris 2 otomatis warna emas)', 'Raih Panggilan Allah\nbersama JM Travel', 1, 2),
('hero_tagline', 'Hero', 'Tagline / Kutipan', 'Melayani dengan Kedekatan, Membimbing dengan Ketulusan.', 0, 3),

-- KENAPA JM TRAVEL
('kenapa_eyebrow', 'Kenapa JM Travel', 'Label Kecil di Atas Judul', 'Kenapa JM Travel?', 0, 1),
('kenapa_headline', 'Kenapa JM Travel', 'Judul Section', 'Dipercaya untuk Perjalanan Paling Mulia', 0, 2),

-- ALUR PENDAFTARAN
('alur_eyebrow', 'Alur Pendaftaran', 'Label Kecil di Atas Judul', 'Gambaran Prosesnya', 0, 1),
('alur_headline', 'Alur Pendaftaran', 'Judul Section', '🚀 Alur Pendaftaran', 0, 2),

-- PROGRAM
('program_eyebrow', 'Program', 'Label Kecil di Atas Judul', 'Program Pilihan', 0, 1),
('program_headline', 'Program', 'Judul Section', 'Program Umroh JM Travel 🕋', 0, 2),
('program_private_judul', 'Program', 'Judul Ajakan Umroh Private', 'Tidak menemukan program yang sesuai kebutuhanmu?', 0, 3),
('program_private_desk', 'Program', 'Deskripsi Ajakan Umroh Private', 'Segera konsultasikan melalui Umroh Private — atur sendiri tanggal keberangkatan, rute, dan preferensimu.', 0, 4),
('program_layanan_lain_label', 'Program', 'Label "Selain Umroh reguler..."', 'Selain Umroh reguler, kami juga melayani:', 0, 5),
('program_layanan_lain_tags', 'Program', 'Daftar Layanan Lain (1 baris = 1 item)', '🕋 Haji Khusus\n🌍 Wisata Halal\n✈️ Umroh+ (kombinasi negara lain, tidak cuma UEA)', 1, 6),

-- KEMITRAAN
('kemitraan_eyebrow', 'Kemitraan', 'Label Kecil di Atas Judul', 'Program Kemitraan', 0, 1),
('kemitraan_headline', 'Kemitraan', 'Judul Section', 'Ubah Niat Baik Jadi Penghasilan Berkah', 0, 2),
('kemitraan_subtext', 'Kemitraan', 'Deskripsi Section', 'Ajak orang ke Baitullah, dapat ujroh tiap closing, dan tabung untuk umrohmu sendiri. Ratusan agen sudah memulai — sekarang giliranmu.', 0, 3),
('kemitraan_agen_judul', 'Kemitraan', 'Judul Card Agen', 'Agen / Pesyiar Baitullah', 0, 4),
('kemitraan_agen_hook', 'Kemitraan', 'Kutipan Card Agen', 'Cukup dari HP. Setiap jamaah yang berangkat = ujroh masuk kantong.', 0, 5),
('kemitraan_agen_items', 'Kemitraan', 'Poin Card Agen (1 baris = 1 poin)', 'Daftar gratis\nUjroh per closing\nTabungan Umroh BSI\nSistem poin Tour Leader', 1, 6),
('kemitraan_perwakilan_judul', 'Kemitraan', 'Judul Card Perwakilan', 'Perwakilan Resmi', 0, 7),
('kemitraan_perwakilan_hook', 'Kemitraan', 'Kutipan Card Perwakilan', 'Punya jaringan sendiri? Tentukan harga, ambil selisih, bangun brand-mu.', 0, 8),
('kemitraan_perwakilan_items', 'Kemitraan', 'Poin Card Perwakilan (1 baris = 1 poin)', 'Tentukan harga sendiri\nUjroh = selisih HPP\nBranding resmi\nDashboard closing', 1, 9),
('kemitraan_modal_agen_simulasi', 'Kemitraan', 'Modal Agen — Simulasi Ujroh', 'Closing 1 jamaah paket Eksekutif → ujroh Rp 3.000.000. Sebagian otomatis jadi Tabungan Umroh BSI, sisanya masuk rekening pribadimu.', 0, 10),
('kemitraan_modal_agen_benefit', 'Kemitraan', 'Modal Agen — Benefit (1 baris = 1 poin)', 'Daftar gratis, tanpa modal\nUjroh setiap jamaah yang berangkat\nOverride berjenjang dari tim yang kamu ajak\nPoin Tour Leader → jalan menuju umroh gratis', 1, 11),
('kemitraan_modal_perwakilan_carakerja', 'Kemitraan', 'Modal Perwakilan — Cara Kerja', 'Kamu dapat harga HPP dari JM Travel, lalu menentukan harga jualmu sendiri. Selisihnya (margin) jadi milikmu.', 0, 12),
('kemitraan_modal_perwakilan_benefit', 'Kemitraan', 'Modal Perwakilan — Benefit (1 baris = 1 poin)', 'Tentukan harga jual sendiri\nUjroh = selisih dari HPP\nBranding resmi di bawah JM Travel\nDashboard closing & laporan sendiri', 1, 13),

-- DOKUMENTASI
('dokumentasi_eyebrow', 'Dokumentasi', 'Label Kecil di Atas Judul', 'Dokumentasi', 0, 1),
('dokumentasi_headline', 'Dokumentasi', 'Judul Section', 'Momen Keberangkatan & Konten Kami', 0, 2),

-- KONTAK
('kontak_headline', 'Kontak', 'Judul Section', 'Siap Menjawab Panggilan-Nya?', 0, 1),
('kontak_subtext', 'Kontak', 'Deskripsi Section', 'Tim kami siap bantu dari konsultasi program sampai keberangkatan — tanpa basa-basi.', 0, 2),

-- FOOTER
('footer_copyright', 'Footer', 'Teks Copyright', 'JM Travel Umroh & Haji — © 2025 PT. Alkhalid Jaya Megah Tours & Travel', 0, 1);
