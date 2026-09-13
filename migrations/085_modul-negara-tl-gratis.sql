-- Skema umum vendor tour: "20 jamaah + 1 TL gratis" — TL cuma bebas biaya
-- kalau rombongan udah capai jumlah minimal, di bawah itu TL tetap kena
-- tarif penuh kayak jamaah. Sebelum ini, tarif tier modul negara SELALU
-- nganggep TL gratis apapun jumlah jamaahnya (lihat komentar "TL udah
-- termasuk di rate-nya" di KalkulatorBiaya.jsx) — kolom ini opsional,
-- kosong = perilaku lama gak berubah (TL selalu gratis).
ALTER TABLE modul_negara
  ADD COLUMN tl_gratis_min_pax INT NULL AFTER pakai_city_tour_opsi;
