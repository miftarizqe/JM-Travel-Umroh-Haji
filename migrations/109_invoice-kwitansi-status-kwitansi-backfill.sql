-- Kwitansi sekarang ikut pakai kolom status yang sama kayak Invoice (biar
-- proses/toggle-nya seragam, bukan cuma dibaca dari nominal_pelunasan) —
-- lihat generateOrUpdateKwitansi/syncKwitansiDariInvoice di
-- src/lib/invoiceKwitansi.js. Baris kwitansi yang udah ada dari SEBELUM
-- perubahan ini masih status='unpaid' (default kolom) walau sebenernya
-- pelunasannya udah diterima — backfill sekali biar konsisten dari awal.
UPDATE invoice_kwitansi
SET status = 'paid'
WHERE jenis = 'kwitansi' AND nominal_pelunasan IS NOT NULL AND status != 'paid';
