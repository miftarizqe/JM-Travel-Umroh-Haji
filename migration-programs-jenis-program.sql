-- Jenis Program di level Program (Kelola Program) — pakai value SAMA PERSIS
-- kayak Kalkulator (umroh_regular/umroh_plus/wisata, lihat JENIS_PROGRAM_LIST
-- di KalkulatorBiaya.jsx) biar "Mulai dari Template" bisa otomatis kefilter
-- cuma nampilin template yang jenisnya cocok — bukan field kosmetik terpisah
-- kayak `type` (Umroh/Haji/Wisata Muslim, dipakai buat display publik, TETAP
-- ADA, gak diubah/diganti).
ALTER TABLE programs
  ADD COLUMN jenis_program VARCHAR(40) NULL AFTER type;
