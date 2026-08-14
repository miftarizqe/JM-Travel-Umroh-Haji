-- "Lanjut tanpa bon" sekarang bisa ditandai langsung per baris di kolom Bon
-- pada tabel transaksi, bukan cuma lewat modal checklist pas mau submit —
-- makanya perlu disimpan biar gak ilang pas reload & gak nanya ulang pas
-- submit kalau sudah pernah ditandai duluan.
ALTER TABLE cashflow_transaksi
  ADD COLUMN tanpa_bon TINYINT(1) NOT NULL DEFAULT 0;
