-- Tanda Terima Uang buat setoran pendaftaran Rp1.000.000 Sahabat Baitullah
-- (dikonfirmasi user 2026-10-21 — gap ditemukan: upload bukti TF cuma catat
-- rekening_ledger + notif admin, gak pernah generate TTU kayak DP/pelunasan
-- program biasa). Kolom ini nandain TTU-nya udah dibuat (idempoten, biar
-- ganti bukti TF gak bikin TTU dobel) + jadi pointer natural ke
-- invoice_kwitansi.id-nya.
ALTER TABLE sahabat_pendaftaran
  ADD COLUMN ttu_setoran_pendaftaran_id INT NULL;
