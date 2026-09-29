-- Syarat & Ketentuan "Ganti Target Impian" Sahabat Baitullah (dikonfirmasi
-- user 2026-09-30) — jamaah wajib baca (scroll-gate) sebelum bisa ngajuin
-- pindah program eksklusif. Isinya dikelola admin lewat editor pasal yang
-- SUDAH ADA (/admin/pengaturan/dokumen), bukan dokumen legal bertanda
-- tangan (gak ada dokumen_signature/materai terlibat) — cukup 1x
-- "sudah baca & setuju" per pengajuan, dicatat langsung di baris pengajuan
-- itu sendiri (sahabat_pendaftaran.target_ganti_status), gak butuh tabel
-- signature terpisah.
ALTER TABLE dokumen_pasal
  MODIFY COLUMN dokumen ENUM('spka_ins','jamaah','spk_ak','sk_cif','surat_pemblokiran','spk_ak_nonis','ganti_target_sahabat') NOT NULL;

INSERT INTO dokumen_pasal (dokumen, nomor, tipe, judul, isi) VALUES
('ganti_target_sahabat', 1, 'pasal', 'Ketentuan Umum', '- Pengajuan penggantian Target Impian (program eksklusif) akan menonaktifkan sementara status Target Impian Anda saat ini sampai pengajuan diproses admin.\n- Selama menunggu ACC admin, Anda tidak dapat mengajukan penggantian ke program lain.\n- Nominal target akan disesuaikan otomatis mengikuti harga program yang baru dipilih.'),
('ganti_target_sahabat', 2, 'pasal', 'Persetujuan & Keputusan Admin', '- Pengajuan ini WAJIB disetujui (ACC) oleh admin/super admin sebelum Target Impian Anda benar-benar berubah.\n- Admin berhak menolak pengajuan apabila program yang diajukan sudah tidak tersedia/aktif.\n- Keputusan admin bersifat final untuk setiap pengajuan.');
