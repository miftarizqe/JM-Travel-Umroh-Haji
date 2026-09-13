-- Alur kirim dokumen (Invoice/Kwitansi/Tanda Terima Uang) ke jamaah: pilihan
-- fisik (cetak + materai asli + TTD di kantor, admin upload scan) atau digital
-- (jalur dokumen_signature yang sudah ada). Kolom generik di sini berlaku
-- untuk semua `jenis` di invoice_kwitansi, walau reminder "belum dikirim"
-- (lihat daftarTtuBelumDikirim di src/lib/invoiceKwitansi.js) baru dipakai
-- untuk jenis='tanda_terima' — biar bisa diperluas ke invoice/kwitansi nanti
-- tanpa migrasi baru.
--
-- Jalankan: mysql -u root -p jm_travel < migration-invoice-kwitansi-pengiriman.sql
ALTER TABLE invoice_kwitansi
  ADD COLUMN terkirim TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN terkirim_metode ENUM('digital','fisik') NULL,
  ADD COLUMN terkirim_at TIMESTAMP NULL,
  ADD COLUMN scan_fisik_path VARCHAR(255) NULL,
  ADD COLUMN scan_fisik_uploaded_at TIMESTAMP NULL;

-- Backfill: dokumen yang sudah pernah lewat jalur TTD digital dianggap sudah
-- "terkirim" sejak awal fitur ini (admin sudah pernah memicu kirim TTD-nya).
UPDATE invoice_kwitansi ik
JOIN dokumen_signature ds ON ds.dokumen = 'invoice' AND ds.ref_id = ik.id
SET ik.terkirim = 1, ik.terkirim_metode = 'digital', ik.terkirim_at = COALESCE(ds.completed_at, ds.requested_at)
WHERE ik.terkirim = 0;
