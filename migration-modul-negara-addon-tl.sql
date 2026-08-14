-- Sebagian biaya tambahan modul negara (mis. Porter Airport/Hotel) beneran
-- ditanggung TL juga, tapi sebagian lain (mis. Tips Guide) harusnya CUMA
-- ditanggung jamaah — sebelum ini semua addon basis per_pax/per_pax_hari
-- SELALU include TL di headcount-nya (gak ada bedanya). Kolom ini opsional,
-- default 1 (perilaku lama gak berubah — semua addon lama tetap include TL)
-- biar data existing gak tiba-tiba beda hasil sampai admin sengaja matiin.
ALTER TABLE modul_negara_addon
  ADD COLUMN sertakan_tl TINYINT NOT NULL DEFAULT 1 AFTER basis;
