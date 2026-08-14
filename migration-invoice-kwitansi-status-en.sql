-- Ganti nilai status invoice_kwitansi ke 'unpaid'/'paid' (Inggris) biar
-- konsisten sama enum status yang sudah ada di bookings.pelunasan_status
-- ('unpaid','pending_confirm','paid') — sebelumnya sempat pakai
-- 'belum_dibayar'/'lunas', beda konvensi sama field status lain di sistem.
ALTER TABLE invoice_kwitansi
  MODIFY status ENUM('belum_dibayar','lunas','unpaid','paid') NOT NULL DEFAULT 'belum_dibayar';
UPDATE invoice_kwitansi SET status = CASE status
  WHEN 'lunas' THEN 'paid'
  WHEN 'belum_dibayar' THEN 'unpaid'
  ELSE status
END;
ALTER TABLE invoice_kwitansi
  MODIFY status ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid';
