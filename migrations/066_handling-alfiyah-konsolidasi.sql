-- Handling Alfiyah itu SATU paket harga 175 SAR/pax (total), bukan 175 SAR
-- per item — 7 item terpisah sebelumnya bikin dobel hitung (175x7). Formula
-- asli Excel juga cuma refer ke 1 sel harga yang sama buat semua barisnya.
UPDATE biaya_master_item
  SET nama = 'Handling Alfiyah (paket lengkap)',
      keterangan = 'Termasuk: Handling Kedatangan & Kepulangan Jeddah, Nasi Box Kedatangan & Kepulangan, Welcome Drink Zam-Zam, Muassasah Airport, Air Zam-Zam 5L'
  WHERE id = 43;
DELETE FROM biaya_master_item WHERE id IN (44, 45, 46, 47, 48, 49);
