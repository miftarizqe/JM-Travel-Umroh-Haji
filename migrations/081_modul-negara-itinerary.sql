-- Itinerary Modul Negara — dikelola SEKALI per modul (bukan diketik ulang tiap
-- kalkulator dibuat, sesuai keputusan user 2026-07-27: itinerary Program
-- Wisata ngikut modul yang dipilih, bukan diketik manual per kalkulator).
-- Disimpan keyed by `hari` (JSON object: {"3": ["Hari 1...", "Hari 2...", "Hari 3..."], "4": [...]})
-- karena 1 modul bisa punya beberapa varian durasi (tier hari beda-beda).
ALTER TABLE modul_negara
  ADD COLUMN itinerary_per_hari JSON NULL AFTER pakai_city_tour_opsi;
