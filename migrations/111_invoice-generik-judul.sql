-- Invoice DP & Invoice Pelunasan dikonsolidasi jadi SATU jenis 'invoice' —
-- gak ada lagi split fix 2 termin, karena nominal & judulnya sekarang admin
-- yang isi bebas tiap generate (bisa DP, Pelunasan, atau cicilan ke berapa
-- pun). Kolom `judul` baru dipakai buat label yang tadinya implisit dari
-- jenis (dulu "Uang Muka (DP)"/"Pelunasan" fixed di kode, sekarang teks
-- bebas per dokumen).
ALTER TABLE invoice_kwitansi
  ADD COLUMN judul VARCHAR(150) NULL,
  MODIFY jenis ENUM('invoice_dp','invoice_pelunasan','invoice','kwitansi','tanda_terima') NOT NULL;

UPDATE invoice_kwitansi SET judul = 'Uang Muka (DP)', jenis = 'invoice' WHERE jenis = 'invoice_dp';
UPDATE invoice_kwitansi SET judul = 'Pelunasan', jenis = 'invoice' WHERE jenis = 'invoice_pelunasan';

ALTER TABLE invoice_kwitansi
  MODIFY jenis ENUM('invoice','kwitansi','tanda_terima') NOT NULL;
