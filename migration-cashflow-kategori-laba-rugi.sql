-- Flag per kategori: apakah ikut dihitung ke Laba Rugi Perusahaan atau tidak.
-- Perlu karena beberapa kategori Cashflow sengaja TIDAK boleh masuk P&L walau
-- itu pengeluaran/pemasukan riil, soalnya udah dihitung otomatis dari sumber
-- lain (HPP & Komisi dari data booking, Pendapatan Booking dari payments) atau
-- memang bukan pendapatan operasional (modal pribadi owner) — kalau ikut
-- dijumlah lagi di P&L, angkanya dobel.
ALTER TABLE cashflow_kategori
  ADD COLUMN termasuk_laba_rugi TINYINT NOT NULL DEFAULT 1 AFTER tipe;

-- Pembayaran Vendor/HPP & Komisi/Ujroh Agen: sudah dihitung otomatis dari
-- data program/booking & komisi_ledger — jangan dobel.
UPDATE cashflow_kategori SET termasuk_laba_rugi = 0 WHERE id IN (8, 9);
-- Pendapatan Booking: sudah dihitung otomatis dari payments/bookings.
-- Modal/Setoran Pemilik: bukan pendapatan operasional, itu suntikan modal.
UPDATE cashflow_kategori SET termasuk_laba_rugi = 0 WHERE id IN (11, 13);
