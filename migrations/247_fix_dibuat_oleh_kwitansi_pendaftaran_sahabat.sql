-- Perbaiki dibuat_oleh yang kebawa jadi id ADMIN (bukan jamaah) buat
-- Kwitansi setoran pendaftaran Sahabat Baitullah yang digenerate lewat
-- tombol manual admin ("Generate Kwitansi" di Database Jamaah) SEBELUM bug
-- ini dibenerin (dikonfirmasi user 2026-10-22) -- generateKwitansiSetoran
-- PendaftaranSahabat sebelumnya nyimpen actorUserId (admin) ke dibuat_oleh
-- kalau yang mencet tombolnya admin, padahal kolom ini dipakai GANDA
-- sebagai "pemilik dokumen" buat akses self-view & penerima notifikasi.
-- Dampaknya: jamaah 403 pas buka link Kwitansi-nya sendiri, notifikasi
-- "Setuju" nyasar ke admin bukan ke jamaah.
UPDATE invoice_kwitansi ik
JOIN sahabat_pendaftaran sp ON sp.kwitansi_setoran_pendaftaran_id = ik.id
SET ik.dibuat_oleh = sp.user_id
WHERE ik.dibuat_oleh != sp.user_id;
