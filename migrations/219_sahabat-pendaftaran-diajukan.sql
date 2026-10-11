-- Tombol "Kirim Pendaftaran" final di /status-pendaftaran-sahabat
-- (dikonfirmasi user 2026-10-11) -- sebelumnya tiap langkah (bukti TF,
-- rekening tabungan umroh, dst) langsung dianggap "terkirim" ke admin begitu
-- disimpan, jamaah gak sempat ngecek ulang & rekening langsung kekunci.
-- Sekarang isian di halaman itu masih DRAFT (bisa diubah jamaah sendiri)
-- sampai jamaah klik "Kirim Pendaftaran"; ACC admin ditahan sampai terisi.
-- Dikosongkan lagi kalau admin "Minta Perbaikan".
ALTER TABLE sahabat_pendaftaran
  ADD COLUMN diajukan_at DATETIME NULL AFTER perbaikan_diminta_at;

-- Data lama: yang sudah aktif, atau sudah sampai antrian ACC admin (setuju
-- SK-CIF & Surat Blokir), dianggap sudah diajukan biar gak mendadak hilang
-- dari antrian admin.
UPDATE sahabat_pendaftaran kp
JOIN users u ON u.id = kp.user_id
SET kp.diajukan_at = COALESCE(u.setuju_sk_cif_pemblokiran_at, NOW())
WHERE kp.diajukan_at IS NULL
  AND (kp.status = 'active' OR u.setuju_sk_cif_pemblokiran_at IS NOT NULL);
