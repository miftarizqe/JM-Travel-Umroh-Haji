-- Info legalitas perusahaan buat halaman Legalitas di Proposal Corporate —
-- statis/reusable sama kayak field lain di proposal_profile, tapi SK
-- PIHK/PPIU sengaja dipisah jadi kolom sendiri (bukan digabung ke 1 teks
-- panjang) karena itu yang paling sering perlu diupdate saat perpanjangan izin.
ALTER TABLE proposal_profile
  ADD COLUMN merk_dagang VARCHAR(150) AFTER dinas_dalam_negeri,
  ADD COLUMN no_registrasi_ghapura VARCHAR(100) AFTER merk_dagang,
  ADD COLUMN no_sk_haji VARCHAR(100) AFTER no_registrasi_ghapura,
  ADD COLUMN no_sk_ppiu VARCHAR(100) AFTER no_sk_haji,
  ADD COLUMN no_sertifikat_ppiu VARCHAR(100) AFTER no_sk_ppiu;

-- Jabatan PIC kami yang mengajukan — sebelumnya cuma nama & kontak yang bisa
-- beda per proposal, jabatannya selalu ikut default Pengaturan Umum. Sekarang
-- bisa beda juga (mis. proposal diajukan pejabat berbeda dari biasanya).
ALTER TABLE proposal_corporate
  ADD COLUMN jabatan_pic_kantor VARCHAR(150) AFTER pic_kantor_nama;
