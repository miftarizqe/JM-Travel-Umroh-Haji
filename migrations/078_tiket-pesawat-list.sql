-- Tiket pesawat bisa lebih dari 1 baris (mis. Jakarta-Dubai + Dubai-Turkey
-- beda harga per rute/negara) — kolom lama tiket_pesawat_rate/mata_uang
-- tetap dipertahankan (fallback buat baris lama yang belum migrasi ke list).
ALTER TABLE biaya_breakdown
  ADD COLUMN tiket_pesawat_list JSON NULL AFTER tiket_pesawat_mata_uang;
