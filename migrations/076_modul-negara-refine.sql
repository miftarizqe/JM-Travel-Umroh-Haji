-- 1) City tour opsi jadi NAMA (teks bebas), bukan angka 1/2 — data lama
--    diberi nama placeholder "Opsi 1"/"Opsi 2" (belum ada nama asli di
--    sumbernya), admin bisa ganti manual lewat "Kelola Modul Negara".
ALTER TABLE modul_negara_tier MODIFY COLUMN city_tour_opsi VARCHAR(60) NULL;
UPDATE modul_negara_tier SET city_tour_opsi = CONCAT('Opsi ', city_tour_opsi) WHERE city_tour_opsi IS NOT NULL;

-- 2) Gabung Umroh + Dubai & Umroh + Turkey jadi satu payung "Umroh Plus" —
--    pembeda negara/vendor sekarang cukup lewat modul_negara (dropdown-nya),
--    bukan jenis_program, biar negara baru nanti gak perlu jenis_program baru.
UPDATE modul_negara SET jenis_program = 'umroh_plus' WHERE jenis_program IN ('umroh_plus_dubai', 'umroh_plus_turkey');
UPDATE biaya_breakdown SET jenis_program = 'umroh_plus' WHERE jenis_program IN ('umroh_plus_dubai', 'umroh_plus_turkey');
UPDATE biaya_master_item SET trigger_kunci = 'jenis_umroh_plus' WHERE trigger_kunci IN ('jenis_umroh_plus_dubai', 'jenis_umroh_plus_turkey');
UPDATE biaya_breakdown_item SET trigger_kunci = 'jenis_umroh_plus' WHERE trigger_kunci IN ('jenis_umroh_plus_dubai', 'jenis_umroh_plus_turkey');

-- 3) Hapus kolom "kode" — dicek, gak ada satupun kode di app yang baca balik
--    field ini (cuma dipaksa unik+wajib di form), jadi cuma nambah friksi
--    tanpa manfaat. `id` sudah jadi pengenal stabil di semua FK/trigger_kunci.
ALTER TABLE modul_negara DROP COLUMN kode;
