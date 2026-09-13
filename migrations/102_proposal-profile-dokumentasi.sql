-- Pilihan foto Dokumentasi buat Proposal Corporate — super_admin milih
-- sendiri dari Galeri Dokumentasi yang udah ada (tipe='keberangkatan'),
-- bukan auto-ambil "6 terbaru" doang. Array id galeri_foto, urutan
-- tampilnya ikut urutan array ini. Kosong = fallback ke 6 foto terbaru.
ALTER TABLE proposal_profile
  ADD COLUMN dokumentasi_foto_ids JSON AFTER legal_dokumen;
