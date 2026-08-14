-- Buat halaman yang MEMANG gak ada yang berubah (Cover, Keutamaan/Paket/
-- Perlengkapan, Poster Penutup) — daripada dibangun ulang pakai HTML/CSS
-- (hasilnya gak akan pernah identik sama desain Canva), tempel langsung
-- gambar hasil export halaman itu apa adanya. Kosong = fallback ke versi
-- HTML yang dirakit dari field teks yang sudah ada (biar gak mendadak
-- kosong kalau belum sempat upload).
ALTER TABLE proposal_profile
  ADD COLUMN gambar_cover VARCHAR(255) AFTER perlengkapan_foto,
  ADD COLUMN gambar_keutamaan VARCHAR(255) AFTER gambar_cover,
  ADD COLUMN gambar_penutup VARCHAR(255) AFTER gambar_keutamaan;
