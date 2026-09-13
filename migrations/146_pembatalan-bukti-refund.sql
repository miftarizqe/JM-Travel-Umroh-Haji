-- Bukti transfer refund pembatalan — admin upload scan/foto bukti TF setelah
-- pembatalan disetujui, biar refund_status akhirnya bisa jadi 'selesai'
-- (sebelumnya nyangkut selamanya di 'diproses', gak ada jalur update) dan
-- jamaah bisa lihat buktinya sendiri di riwayat booking yang dibatalkan.
--
-- Jalankan: mysql -u root -p jm_travel < migration-pembatalan-bukti-refund.sql
ALTER TABLE pembatalan
  ADD COLUMN bukti_refund_path VARCHAR(255) NULL,
  ADD COLUMN bukti_refund_uploaded_at TIMESTAMP NULL;
