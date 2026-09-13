ALTER TABLE biaya_master_item ADD COLUMN trigger_kunci VARCHAR(40) NULL AFTER basis_default;
ALTER TABLE biaya_breakdown_item ADD COLUMN trigger_kunci VARCHAR(40) NULL AFTER basis;

-- Cost Saudi (Via Mutawwif) — diverifikasi ulang dari formula asli Excel
UPDATE biaya_master_item SET trigger_kunci = 'handling_jeddah_off' WHERE id IN (2, 3, 16, 17, 24, 26);
UPDATE biaya_master_item SET trigger_kunci = 'city_tour_mekkah' WHERE id IN (5, 18);
UPDATE biaya_master_item SET trigger_kunci = 'city_tour_thaif' WHERE id IN (6, 19, 20);
UPDATE biaya_master_item SET trigger_kunci = 'city_tour_madinah' WHERE id IN (10, 21);
UPDATE biaya_master_item SET trigger_kunci = 'haramain_express' WHERE id IN (12, 23);
-- sisanya (1,4,7,8,9,11,13,14,15,22,25) baseline — tetap NULL

-- Cost Jakarta (Via Management)
UPDATE biaya_master_item SET trigger_kunci = 'manasik_umroh' WHERE id = 27;
UPDATE biaya_master_item SET trigger_kunci = 'haramain_express' WHERE id = 31;
UPDATE biaya_master_item SET trigger_kunci = 'perlengkapan_jamaah' WHERE id = 32;
-- sisanya (28,29,30,33) baseline — tetap NULL

-- Cost Transportation — compound trigger (kendaraan × kombinasi haramain/city_tour_thaif)
UPDATE biaya_master_item SET trigger_kunci = 'transport_bus_operasional' WHERE id = 34;
UPDATE biaya_master_item SET trigger_kunci = 'transport_bus_citytourthaif' WHERE id = 35;
UPDATE biaya_master_item SET trigger_kunci = 'transport_bus_haramain' WHERE id = 36;
UPDATE biaya_master_item SET trigger_kunci = 'transport_bus_allin' WHERE id = 37;
UPDATE biaya_master_item SET trigger_kunci = 'transport_hiace_operasional' WHERE id = 38;
UPDATE biaya_master_item SET trigger_kunci = 'transport_hiace_citytourthaif' WHERE id = 39;
UPDATE biaya_master_item SET trigger_kunci = 'transport_hiace_haramain' WHERE id = 40;
UPDATE biaya_master_item SET trigger_kunci = 'transport_hiace_allin' WHERE id = 41;

-- Handling Alfiyah — semua aktif kalau Handling Jeddah ON
UPDATE biaya_master_item SET trigger_kunci = 'handling_jeddah' WHERE id IN (43, 44, 45, 46, 47, 48, 49);
