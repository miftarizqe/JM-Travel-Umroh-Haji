-- Include/Exclude per Modul Negara (Dubai/Turkey dkk) — sebelumnya include/
-- exclude cuma ada di level Program/Kalkulator (shared.include_items/
-- exclude_items, diketik manual admin tiap bikin costing baru). Sekarang
-- modul bisa punya include/exclude sendiri yang OTOMATIS ke-gabung ke daftar
-- Program begitu modul itu dipilih — sama prinsipnya kayak itinerary_per_hari
-- (lihat itineraryHariModul di src/lib/kalkulatorBiaya.js).
--
-- Struktur JSON: { [nama_city_tour_atau_'']: { include: "1 baris per item",
-- exclude: "1 baris per item" } } — key '' = berlaku SEMUA city tour (dipakai
-- juga buat modul yang gak pakai_city_tour_opsi sama sekali). Beda per City
-- Tour (mis. Full Day include makan siang, Half Day enggak) — DIKONFIRMASI
-- user, BUKAN per Hari (include/exclude gak sedetail itu bedanya).
--
-- Jalankan sekali di MySQL, database: jm_travel

ALTER TABLE modul_negara ADD COLUMN include_exclude JSON NULL AFTER itinerary_per_hari;
