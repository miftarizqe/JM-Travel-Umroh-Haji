-- Panduan step-by-step cara buka rekening BSI (biasa) & Tabungan Umroh
-- Byond (dikonfirmasi user 2026-09-20) — admin upload sendiri (gambar/PDF),
-- ditampilkan ke jamaah Sahabat Baitullah di wizard daftar-sahabat step 4
-- & halaman status-pendaftaran-sahabat. 2 file terpisah (bukan 1 gabungan)
-- karena dua jenis rekening beda proses/aplikasi.
ALTER TABLE pengaturan
  ADD COLUMN panduan_buka_rekening_bsi_path VARCHAR(255) NULL,
  ADD COLUMN panduan_buka_tabungan_umroh_path VARCHAR(255) NULL;
