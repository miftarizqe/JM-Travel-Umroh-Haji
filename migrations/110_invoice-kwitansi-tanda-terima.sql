-- Tanda Terima Uang: dokumen bukti terima uang PER PEMBAYARAN (DP, cicilan,
-- pelunasan) — terbit otomatis tiap payment di-approve, beda dari Kwitansi
-- yang sekarang cuma terbit SEKALI pas lunas total (lihat perubahan di
-- src/lib/invoiceKwitansi.js). Nomor urut resmi sendiri (counter 'TTU').
--
-- payment_id dipakai buat idempotensi (1 payment = maksimal 1 Tanda Terima,
-- gak boleh dobel kalau ada retry) DAN buat nunjukin pembayaran mana yang
-- didokumentasiin. Nullable karena Invoice/Kwitansi/dokumen manual gak nempel
-- ke 1 payment spesifik.
ALTER TABLE invoice_kwitansi
  MODIFY jenis ENUM('invoice_dp','invoice_pelunasan','kwitansi','tanda_terima') NOT NULL,
  ADD COLUMN payment_id VARCHAR(36) NULL,
  ADD CONSTRAINT fk_invoice_kwitansi_payment FOREIGN KEY (payment_id) REFERENCES payments(id);
