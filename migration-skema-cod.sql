USE jm_travel;

-- Skema ke-5: COD (uang tetap di rekening pribadi jamaah, dikunci sampai
-- tiba di Baitullah, travel nalangin dulu). Sudah dieksekusi manual di DB,
-- file ini cuma buat catatan/riwayat perubahan skema_pembayaran.
INSERT INTO skema_pembayaran (urutan, judul, deskripsi, pesan_wa)
SELECT 5,
  'COD — Uang Tetap di Rekening Anda Sampai Baitullah',
  'DP Rp 5.000.000, lalu sisa pembayaran Anda simpan sendiri di rekening BSI atas nama Anda pribadi (bukan rekening travel) dan dikunci sampai Anda tiba di Baitullah. JM Travel menalangi biaya keberangkatan terlebih dahulu — uang baru dicairkan ke kami setelah Anda sampai. Cocok buat yang khawatir gagal berangkat tapi uang hilang, karena dana tetap di rekening Anda sendiri. Syarat: berlaku untuk 1 kloter yang menggunakan skema yang sama.',
  'Assalamu''alaikum JM Travel, saya ingin tanya soal skema COD (uang tetap di rekening pribadi sampai Baitullah).'
WHERE NOT EXISTS (SELECT 1 FROM skema_pembayaran WHERE judul LIKE 'COD%');
