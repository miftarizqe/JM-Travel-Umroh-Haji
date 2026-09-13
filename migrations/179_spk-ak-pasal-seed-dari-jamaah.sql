-- SPK-AK ('Surat Perjanjian Kerja Sama Jamaah Sahabat Baitullah') belum
-- pernah diisi pasal-nya sama sekali (0 baris) — dikonfirmasi user
-- 2026-09-09, isi awalnya di-COPY dari dokumen 'jamaah' (Perjanjian
-- Keberangkatan Jamaah, yang sudah ada 5 pasal) sebagai titik awal, BUKAN
-- dipindah — dokumen 'jamaah' TETAP UTUH (masih dipakai alur booking
-- reguler/cetak-perjanjian, jangan sampai kosong). Isinya cuma starting
-- point generik (soal pembayaran/dokumen), admin masih perlu sesuaikan
-- lagi ke konteks SPK-AK yang beneran lewat /admin/pengaturan/dokumen.
INSERT INTO dokumen_pasal (dokumen, nomor, judul, isi)
SELECT 'spk_ak', nomor, judul, isi FROM dokumen_pasal WHERE dokumen = 'jamaah' ORDER BY nomor;
