-- Kolom `setuju_data_pribadi_at` dipakai kode (POST /api/auth/register,
-- /lib/jaringan.js, /api/sahabat/team, /api/sahabat/downline/[user_id],
-- /api/sahabat/dashboard, /app/register/page.jsx, /app/dashboard/sahabat/
-- page.jsx) buat persetujuan data pribadi WAJIB saat daftar Sahabat
-- Baitullah ("Saya setuju nama, no. telepon, dan progres tabungan umroh
-- saya dapat dilihat oleh pengajak/upline", dikonfirmasi user 2026-10-02)
-- TAPI migrasinya kelewat gak pernah dibuat sebelumnya — bug nyata
-- (ditemukan 2026-10-02): registrasi role sahabat_baitullah selalu gagal
-- "Terjadi kesalahan server" (500) karena INSERT INTO users nulis ke kolom
-- yang belum ada.
ALTER TABLE users
  ADD COLUMN setuju_data_pribadi_at TIMESTAMP NULL DEFAULT NULL;
