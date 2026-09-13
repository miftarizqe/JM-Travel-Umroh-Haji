-- Ganti "Periode 1/2" (label abstrak) jadi rentang TANGGAL beneran (kalender)
-- di tabel tier — soalnya musim harga di sumbernya emang dari-sampai tanggal
-- (mis. "April - September 2026"), bukan sekadar nomor periode.
ALTER TABLE modul_negara_tier
  ADD COLUMN periode_mulai DATE NULL AFTER periode,
  ADD COLUMN periode_selesai DATE NULL AFTER periode_mulai;

-- Migrasi data lama: Periode 1 = Apr-Sep 2026, Periode 2 = Okt 2026-Mar 2027
-- (sesuai label section header di spreadsheet costing asli).
UPDATE modul_negara_tier SET periode_mulai = '2026-04-01', periode_selesai = '2026-09-30' WHERE periode = '1';
UPDATE modul_negara_tier SET periode_mulai = '2026-10-01', periode_selesai = '2027-03-31' WHERE periode = '2';

ALTER TABLE modul_negara_tier DROP COLUMN periode;
