-- Konten "Company Profile" buat Proposal Corporate — diedit SEKALI di
-- /admin/pengaturan/proposal-profile, otomatis ikut ke SEMUA proposal baru
-- (beda dari field per-proposal di proposal_corporate yang emang sengaja
-- beda-beda tiap dibuat). Row tunggal, sama pola kayak tabel `pengaturan`.
CREATE TABLE IF NOT EXISTS proposal_profile (
  id INT PRIMARY KEY DEFAULT 1,
  tagline VARCHAR(255),
  deskripsi_singkat TEXT,
  profil TEXT,
  visi TEXT,
  misi TEXT,                    -- 1 baris = 1 poin misi
  org_ceo_nama VARCHAR(150),
  org_ceo_jabatan VARCHAR(150),
  org_l2_nama VARCHAR(150),
  org_l2_jabatan VARCHAR(150),
  org_l3 JSON,                  -- array {jabatan, nama} - baris sejajar di bawah org_l2
  keutamaan TEXT,                -- 1 baris = 1 poin
  paket_umroh TEXT,              -- 1 baris = 1 poin
  perlengkapan_jamaah TEXT,      -- 1 baris = 1 poin
  perlengkapan_foto VARCHAR(255),
  syarat_persyaratan_umroh TEXT,
  syarat_pembatalan_umroh TEXT,
  syarat_haji_khusus TEXT,
  layanan_umroh_mandiri TEXT,
  wisata_non_umroh TEXT,
  dinas_dalam_negeri TEXT,
  legal_dokumen JSON,            -- array {label, path}
  CONSTRAINT chk_proposal_profile_singleton CHECK (id = 1)
);
INSERT IGNORE INTO proposal_profile (id) VALUES (1);

-- Tujuan/occasion spesifik proposal (mis. "Program Reward Perjalanan Wisata
-- Agen Asuransi Sinar Mas") — beda dari kata_pengantar yang lebih umum.
ALTER TABLE proposal_corporate
  ADD COLUMN tujuan VARCHAR(255) AFTER nomor_proposal;

-- Program custom yang dibikin khusus buat 1 proposal (bukan dari katalog
-- programs, gak permanen/gak nyampur ke katalog utama) — array objek
-- {nama, jenis_program, durasi, pax_jamaah, pax_tl, pax_mutawwif,
--  transportasi, haramain_express, city_tour, hotel: [{lokasi,bintang,malam}],
--  itinerary: [teks per hari], harga: {quad,triple,double} atau {semua}}.
ALTER TABLE proposal_corporate
  ADD COLUMN custom_programs JSON AFTER program_ids;
