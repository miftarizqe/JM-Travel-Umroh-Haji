-- Settlement (TF ke staff) beda-beda maunya pas dicetak PDF: ada yang mau
-- dipecah rincian belanjanya, ada yang cukup 1 baris gelondongan (mis. gaji).
-- Makanya ini per-transaksi, bukan pengaturan global pas cetak.
ALTER TABLE cashflow_transaksi
  ADD COLUMN cetak_mode ENUM('rincian','totalan') NOT NULL DEFAULT 'rincian';
