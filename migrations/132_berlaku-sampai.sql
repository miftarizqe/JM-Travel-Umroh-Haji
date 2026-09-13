-- "Berlaku Sampai" — jaring pengaman buat rate yang gak diisi periode_mulai/
-- periode_selesai sama sekali. Sebelumnya rate kayak gitu keliatan "Berlaku
-- selamanya" (lihat labelPeriode() di admin/master-data/page.jsx) tanpa
-- tanda kadaluarsa apa pun — resiko admin gak sadar masih makai harga
-- vendor yang udah basi pas isi Kalkulator dari master. TIDAK menggantikan
-- periode_mulai/selesai yang udah ada, cuma fallback kalau itu dibiarin
-- kosong. TIDAK memblokir pemakaian (masih boleh dipilih walau kadaluarsa,
-- cuma ditandain ⚠️ di UI) — dikonfirmasi user.
--
-- Jalankan sekali di MySQL, database: jm_travel

ALTER TABLE master_hotel_rate ADD COLUMN berlaku_sampai DATE NULL AFTER periode_selesai;
ALTER TABLE master_tiket_rate ADD COLUMN berlaku_sampai DATE NULL AFTER periode_selesai;
ALTER TABLE modul_negara_tier ADD COLUMN berlaku_sampai DATE NULL AFTER periode_selesai;
