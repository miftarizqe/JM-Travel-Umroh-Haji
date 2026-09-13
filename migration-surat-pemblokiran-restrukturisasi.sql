-- Restrukturisasi isi Surat Pemblokiran biar PERSIS template resmi BSI yang
-- dikasih user (2026-09-09, "Surat Pernyataan Pemblokiran Rekening
-- Haji/Umroh.pdf"):
--   - 6 poin "Dengan ini menyatakan: 1... 2... 3..." itu SATU list bernomor
--     utuh (bukan 2 poin manual + 1 blok gabungan 4 sub-item kayak
--     sebelumnya) — cukup 1 baris isi tipe 'isian' pakai sintaks "- item"
--     buat SEMUA 6 poin, auto jadi <ol> bernomor 1-6 lewat
--     parsePasalMarkup (lihat pasalMarkup.jsx) — makanya tipe 'pernyataan'
--     yang tadinya dipakai buat ini DIHAPUS, gak perlu lagi.
--   - "Demikian surat pernyataan..." itu paragraf PENUTUP terpisah, TANPA
--     nomor, di LUAR list 6 poin.
-- Blok tanda tangan (Pemberi Pernyataan/Mengetahui Petugas Bank + Materai)
-- BUKAN bagian dari sistem pasal — itu di-hardcode di komponen
-- SignatureBlokBank (pasalMarkup.jsx), dirender otomatis setelah pasal
-- terakhir buat sk_cif/surat_pemblokiran.

-- 1) Copot 'pernyataan' dari ENUM tipe — gak pernah kepakai lagi.
UPDATE dokumen_pasal SET tipe = 'isian' WHERE tipe = 'pernyataan';
UPDATE dokumen_pasal_snapshot SET tipe = 'isian' WHERE tipe = 'pernyataan';

ALTER TABLE dokumen_pasal MODIFY COLUMN tipe ENUM('pasal','isian') NOT NULL DEFAULT 'pasal';
ALTER TABLE dokumen_pasal_snapshot MODIFY COLUMN tipe ENUM('pasal','isian') NOT NULL DEFAULT 'pasal';

-- 2) Ganti nomor 2-4 surat_pemblokiran (blokir/instruksi/pernyataan
-- tambahan yang lama) jadi 2 baris baru: 1 list 6 poin + 1 penutup.
DELETE FROM dokumen_pasal WHERE dokumen = 'surat_pemblokiran' AND nomor IN (2, 3, 4);

INSERT INTO dokumen_pasal (dokumen, nomor, tipe, judul, isi) VALUES
('surat_pemblokiran', 2, 'isian', 'Daftar Pernyataan',
'- Memberikan kuasa kepada Bank Syariah Indonesia Kantor Cabang Pembantu Jakarta Utan Kayu, untuk melakukan BLOKIR SALDO rekening saya sejumlah **Rp{{nominal_blokir}}** selama jangka waktu **{{jangka_waktu_hari}} hari**, terhitung dari tanggal **{{tanggal_mulai_blokir}}** dengan tujuan untuk kepentingan menabung Tabungan Umroh.\n- Memberikan instruksi kepada Bank Syariah Indonesia Kantor Cabang Pembantu Jakarta Utan Kayu, untuk melakukan PENDEBETAN dan sekaligus PEMINDAHBUKUAN sejumlah dana/uang sebesar **Rp{{nominal_blokir}}** yang ada di rekening tersebut di atas kepada **PT Alkhalid Jaya Megah, No. Rekening: 7080660361** untuk keperluan pembelian Paket Ibadah Umroh yang dibuktikan dengan manifest keberangkatan atau visa keberangkatan.\n- Menyatakan tidak akan melakukan penarikan saldo secara pribadi sesuai kesepakatan selama proses menabung Tabungan Umroh.\n- Memberikan Kuasa kepada Bank Syariah Indonesia untuk memberikan informasi saldo kepada pihak yang membutuhkan.\n- Surat Pernyataan Kuasa Blokir dan Instruksi Pendebetan ini tidak dapat saya cabut dan batalkan sesuai kesepakatan dengan Bank Syariah Indonesia.\n- Menyatakan membebaskan Bank Syariah Indonesia dari segala tuntutan hukum yang berlaku berkaitan dengan surat pernyataan ini.'),

('surat_pemblokiran', 3, 'isian', 'Penutup',
'Demikian surat pernyataan ini dibuat dengan sebenarnya dan agar dapat digunakan sebagaimana mestinya.');
