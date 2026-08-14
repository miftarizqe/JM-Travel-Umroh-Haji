-- Bintang mana yang diaktifkan/ditampilkan di tabel Hasil HPP & PDF — cuma
-- relevan buat Hotel Fix (3 bintang beneran beda hotel). NULL = perilaku
-- lama (semua bintang aktif), biar template lama gak berubah tampilannya.
ALTER TABLE biaya_breakdown
  ADD COLUMN bintang_aktif JSON NULL AFTER hotel_mode;
