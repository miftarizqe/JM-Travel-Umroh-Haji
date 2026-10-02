-- Master Item (biaya_master_item) sekarang boleh beneran dihapus
-- (dikonfirmasi user 2026-10-02, sebelumnya cuma bisa "Nonaktifkan" lewat
-- UI — DELETE endpoint-nya udah ada tapi gak pernah dipasang tombolnya,
-- plus FK master_item_id masih default RESTRICT jadi bakal gagal kalau
-- item itu udah pernah dipakai di breakdown manapun).
--
-- ON DELETE SET NULL: begitu master item dihapus, baris biaya_breakdown_item
-- yang masih nunjuk ke situ LEPAS link-nya (master_item_id jadi NULL), TAPI
-- nama/nominal/kelompok baris itu TETAP APA ADANYA (kolom independen, bukan
-- live-join ke master item — sudah snapshot sejak awal). Ini yang jamin
-- breakdown program yang SUDAH DIBUAT (biaya_breakdown.program_id IS NOT
-- NULL) gak pernah berubah gara-gara master item-nya diedit/dihapus
-- belakangan.
--
-- Baris breakdown milik DRAFT/TEMPLATE (biaya_breakdown.program_id IS NULL)
-- yang ikut dihapus beneran (bukan cuma lepas link) ditangani di APLIKASI
-- (DELETE /api/admin/biaya-master-item), bukan di sini — FK cuma jaring
-- pengaman generik, logika draft-vs-published-nya butuh query JOIN yang gak
-- bisa diekspresikan di constraint FK biasa.
ALTER TABLE biaya_breakdown_item
  DROP FOREIGN KEY biaya_breakdown_item_ibfk_2;
ALTER TABLE biaya_breakdown_item
  ADD CONSTRAINT fk_biaya_breakdown_item_master_item
    FOREIGN KEY (master_item_id) REFERENCES biaya_master_item(id) ON DELETE SET NULL;
