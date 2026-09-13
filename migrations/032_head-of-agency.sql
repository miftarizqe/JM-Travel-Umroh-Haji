USE jm_travel;

-- Head of Agency di SPKA SEBELUMNYA dihitung otomatis dari hierarki upline
-- (siapa leader terdekat di atas agen itu) — tapi kenyataannya cuma ada SATU
-- Head of Agency buat seluruh agency (saat ini Albert Siswanto). Diubah jadi
-- field tetap di Pengaturan Dokumen, sama kayak Nama/Jabatan Penandatangan —
-- kalau orangnya ganti, admin tinggal update di sini, gak nunggu hierarki.
-- Dikosongin = blok "Mengetahui Head of Agency" gak ditampilkan di SPKA baru.
ALTER TABLE pengaturan
  ADD COLUMN nama_head_of_agency VARCHAR(150) AFTER jabatan_penandatangan,
  ADD COLUMN jabatan_head_of_agency VARCHAR(150) AFTER nama_head_of_agency;

UPDATE pengaturan SET
  nama_head_of_agency = 'Albert Siswanto',
  jabatan_head_of_agency = 'Head of Agency'
WHERE id = 1;

-- Head of Agency juga ikut dibekukan per dokumen SPKA (sama seperti
-- penandatangan) — kolom nullable krn cuma relevan buat dokumen='spka'.
ALTER TABLE dokumen_signer_snapshot
  ADD COLUMN head_of_agency_nama VARCHAR(150) NULL,
  ADD COLUMN head_of_agency_jabatan VARCHAR(150) NULL;
