-- "Minta perbaikan data" sebagai pilihan tolak yang gak ngeblok login
-- (dikonfirmasi user 2026-10-11) -- sebelumnya satu-satunya cara admin nolak
-- adalah users.status = 'rejected', yang bikin user gak bisa login sama
-- sekali (notifikasi alasan tolaknya pun gak pernah kebaca). Tolak permanen
-- ('rejected') TETAP ada buat akun spam/palsu.
--
-- 1) Verifikasi akun (semua role non-staff, form registrasi: nama, email,
--    WA, NIK, agama): flag di users. Diisi admin, dikosongkan lagi begitu
--    user kirim perbaikan (balik ke antrian "Menunggu Verifikasi Akun").
ALTER TABLE users
  ADD COLUMN perbaikan_akun_diminta_at DATETIME NULL AFTER terverifikasi,
  ADD COLUMN perbaikan_akun_catatan TEXT NULL AFTER perbaikan_akun_diminta_at;

-- 2) Pendaftaran Sahabat Baitullah (form data diri): flag di baris
--    pendaftarannya, status funnel-nya SENGAJA gak diubah -- progres
--    (bukti TF, rekening, dokumen) tetap jalan, cuma ACC admin ditahan
--    sampai jamaah kirim perbaikan. Alasannya pakai catatan_admin yang udah ada.
ALTER TABLE sahabat_pendaftaran
  ADD COLUMN perbaikan_diminta_at DATETIME NULL AFTER status;
