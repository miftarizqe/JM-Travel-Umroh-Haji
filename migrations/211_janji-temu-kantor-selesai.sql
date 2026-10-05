-- Trigger "selesai" buat Janji Temu Datang ke Kantor (dikonfirmasi user
-- 2026-10-05) -- sebelumnya gak ada cara nandain appointment udah kelar
-- (orangnya udah dateng & dokumen udah di-TTD di tempat), jadi yang udah
-- lewat tanggal numpuk terus di "Terlewat" selamanya. 1 kolom generik di
-- `users` -- dipakai BARENG buat Sahabat Baitullah (metode_ttd_sahabat) &
-- Perwakilan (reg_metode), karena 1 user cuma punya 1 janji temu kantor
-- aktif dalam satu waktu (role manapun yang kepake).
ALTER TABLE users
  ADD COLUMN janji_temu_kantor_selesai_at DATETIME NULL AFTER rencana_kunjungan_kantor_at;
