-- Fotokopi (freeze) data modul negara (tier + addon) yang dipakai suatu
-- Program, diresolve & disimpen pas Program itu PERTAMA KALI disimpan —
-- biar costing Program yang udah jadi TIDAK ikut berubah walaupun modul
-- negara di katalog diedit/dihapus belakangan. Template (biaya_breakdown
-- is_template=1) TETAP live, gak kena snapshot ini — cuma Program yang
-- udah nempel (punya id) yang dikunci. Diperbarui lagi HANYA lewat aksi
-- eksplisit "Sinkronkan ke Harga Katalog Terbaru" di halaman Kelola Program.
ALTER TABLE programs ADD COLUMN katalog_modul_snapshot JSON NULL;
