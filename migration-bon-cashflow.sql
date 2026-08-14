-- Lampiran bon/bukti untuk tiap catatan cashflow manual (opex & pendapatan lain),
-- supaya rekap bulanan bisa nunjukin bon aslinya, bukan cuma angka.
ALTER TABLE pengeluaran_operasional
  ADD COLUMN bukti_path VARCHAR(255) NULL AFTER nominal,
  ADD COLUMN bukti_nama VARCHAR(255) NULL AFTER bukti_path;

ALTER TABLE pendapatan_lain
  ADD COLUMN bukti_path VARCHAR(255) NULL AFTER nominal,
  ADD COLUMN bukti_nama VARCHAR(255) NULL AFTER bukti_path;
