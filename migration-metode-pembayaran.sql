USE jm_travel;

-- Pengaturan Umum SEBELUMNYA cuma nampung 1 rekening (bank_nama/bank_rekening/
-- bank_atas_nama) — gak cukup kalau JM Travel punya beberapa cara bayar
-- (beberapa bank, e-wallet, QRIS, dst). Pindah ke tabel tersendiri biar bisa
-- tambah/hapus/reorder/nonaktifkan cara bayar tanpa ubah kode, sama pola
-- kayak dokumen_pasal (lihat migration-dokumen-pasal.sql).
CREATE TABLE IF NOT EXISTS metode_pembayaran (
  id INT PRIMARY KEY AUTO_INCREMENT,
  urutan INT NOT NULL,
  nama VARCHAR(100) NOT NULL,        -- mis. "Bank Syariah Indonesia (BSI)", "DANA", "QRIS"
  nomor VARCHAR(100),                -- no. rekening / no. HP e-wallet, boleh kosong (mis. QRIS cuma gambar)
  atas_nama VARCHAR(150),
  catatan VARCHAR(255),              -- opsional, mis. "khusus DP" atau instruksi tambahan
  gambar_qr VARCHAR(255),            -- opsional, path gambar QR code
  aktif TINYINT(1) DEFAULT 1,        -- tampil/sembunyi tanpa hapus datanya
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migrasi rekening yang udah ada di Pengaturan Umum jadi metode pertama,
-- biar gak ada yang hilang pas pindah sistem.
INSERT INTO metode_pembayaran (urutan, nama, nomor, atas_nama)
SELECT 1, bank_nama, bank_rekening, bank_atas_nama
FROM pengaturan WHERE id = 1 AND bank_nama IS NOT NULL;
