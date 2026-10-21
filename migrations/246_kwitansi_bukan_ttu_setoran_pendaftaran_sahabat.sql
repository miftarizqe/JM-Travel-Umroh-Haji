-- Koreksi migration 245 (dikonfirmasi user 2026-10-21): setoran pendaftaran
-- Rp1jt itu pembayaran LUNAS/TUNTAS buat transaksi ini (bukan DP yang masih
-- nyisain pelunasan nanti), jadi dokumennya harusnya Kwitansi, bukan Tanda
-- Terima Uang -- sama aturan "Kwitansi cuma di pembayaran lunas total" yang
-- dipakai program biasa (lihat project_invoice_kwitansi_tanda_terima_flow).
ALTER TABLE sahabat_pendaftaran
  CHANGE COLUMN ttu_setoran_pendaftaran_id kwitansi_setoran_pendaftaran_id INT NULL;
