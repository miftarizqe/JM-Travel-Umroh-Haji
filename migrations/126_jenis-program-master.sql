-- ============================================
-- MIGRATION: Jenis Program jadi master data (admin-editable)
--
-- Sebelumnya JENIS_PROGRAM_LIST di-hardcode di kode (src/lib/kalkulatorBiaya.js)
-- — nambah kategori baru berarti developer yang edit. Sekarang jadi tabel
-- yang admin kelola sendiri lewat /admin/master-data.
--
-- punya_umroh = ada leg Mekkah/Madinah (Umroh Regular/Plus/Haji) atau nggak
-- (Program Wisata murni modul negara doang) — gantiin cek string
-- `jenis_program === 'wisata'` yang sebelumnya nyebar di banyak tempat
-- (KalkulatorTerpadu.jsx, kalkulatorPublik.js, KalkulatorBiaya.jsx).
--
-- boleh_modul_negara = boleh nawarin negara tambahan (Turkey/Dubai/dll) ke
-- pengunjung — Umroh Plus & Wisata true, Umroh Regular & Haji false. AXIS
-- BEDA dari punya_umroh (Umroh Plus punya_umroh=1 TAPI boleh_modul_negara=1
-- juga — dua-duanya bisa true bareng).
--
-- tipe_program = dipetakan ke programs.type ('Umroh'/'Haji'/'Wisata Muslim')
-- pas admin bikin program dari kategori ini — gantiin TYPE_DARI_JENIS_PROGRAM
-- hardcoded map di admin/programs/page.jsx.
--
-- Seed 4 baris = migrasi PERSIS nilai JENIS_PROGRAM_LIST lama, flag-nya
-- disesuaikan supaya PERILAKU SISTEM GAK BERUBAH SAMA SEKALI buat data yang
-- udah ada (Program Umroh Berdua/Umroh Plus/Program Wisata dari kerjaan
-- sebelumnya tetap jalan sama persis).
--
-- Jalankan sekali di MySQL, database: jm_travel
-- ============================================

CREATE TABLE IF NOT EXISTS jenis_program_master (
  value VARCHAR(30) PRIMARY KEY,
  label VARCHAR(60) NOT NULL,
  punya_umroh TINYINT(1) NOT NULL DEFAULT 1,
  boleh_modul_negara TINYINT(1) NOT NULL DEFAULT 0,
  tipe_program VARCHAR(30) NOT NULL DEFAULT 'Umroh',
  urutan INT NOT NULL DEFAULT 0,
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO jenis_program_master (value, label, punya_umroh, boleh_modul_negara, tipe_program, urutan)
VALUES
  ('umroh_regular', 'Umroh Regular', 1, 0, 'Umroh', 0),
  ('umroh_plus', 'Umroh Plus', 1, 1, 'Umroh', 1),
  ('haji', 'Haji', 1, 0, 'Haji', 2),
  ('wisata', 'Program Wisata', 0, 1, 'Wisata Muslim', 3)
ON DUPLICATE KEY UPDATE value = value;
