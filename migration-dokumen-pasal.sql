USE jm_travel;

-- Isi pasal dokumen legal (SPKA, SPKA-Ins, SPKL, Perjanjian Jamaah) — dipindah
-- dari kode (src/lib/pksIsi.jsx & src/lib/pksContent.js) ke sini biar admin
-- bisa update wording tanpa minta developer ubah kode. SENGAJA TIDAK ada
-- versioning/snapshot per dokumen (lihat diskusi Pengaturan Umum) — kalau
-- pasal diedit, SEMUA cetak ulang (lama & baru) langsung pakai teks terbaru,
-- sama persis risikonya kayak sekarang (edit kode = berlaku ke semua cetakan).
--
-- Kolom `isi` pakai markup ringan (bukan HTML bebas):
--   **Judul Sub**          -> baris tersendiri, jadi sub-heading tebal
--   - item                 -> list bernomor level 1
--     - item (indent 2sp)  -> sub-list huruf (a, b, c...) di dalam item di atasnya
--   **tebal** di tengah teks -> jadi <b>
--   {{bank_agen}} {{rekening_agen}} {{nama_rekening_agen}} -> diganti data
--     rekening PENANDA TANGAN saat render (beda tiap agen/perwakilan/leader,
--     BUKAN rekening kantor — rekening kantor ditulis sebagai teks biasa).
CREATE TABLE IF NOT EXISTS dokumen_pasal (
  dokumen ENUM('spka', 'spka_ins', 'spkl', 'jamaah') NOT NULL,
  nomor INT NOT NULL,
  judul VARCHAR(255) NOT NULL,
  isi MEDIUMTEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (dokumen, nomor)
);
