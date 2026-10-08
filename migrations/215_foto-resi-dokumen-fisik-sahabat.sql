-- Konfirmasi kirim dokumen fisik Sahabat Baitullah (metode 'kirim') sekarang
-- WAJIB nomor resi + foto resi (dikonfirmasi user 2026-10-08) — sebelumnya
-- resi opsional & gak ada bukti foto. Disimpan di baris users yang sama
-- (1 jamaah = 1 paket), jadi update resi/foto gak pernah nambah baris baru.
ALTER TABLE users
  ADD COLUMN dokumen_fisik_resi_foto_path VARCHAR(255) NULL AFTER dokumen_fisik_resi;
