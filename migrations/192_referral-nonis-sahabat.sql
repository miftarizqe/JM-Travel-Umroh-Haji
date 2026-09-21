-- Referral Non-Muslim buat Sahabat Baitullah (dikonfirmasi user 2026-09-20)
-- — orang non-Muslim boleh jadi anggota/perekrut Sahabat Baitullah (nabung
-- & rekrut kayak biasa), tapi karena gak bisa umroh sendiri, dia
-- memberangkatkan orang lain (yang Islam) pakai akun/tabungannya sendiri.
-- Booking/jamaah_data-nya SUDAH SUPPORT identitas traveler beda dari akun
-- (gak perlu diubah) — yang perlu ditambah cuma penanda agama + dokumen
-- perjanjian terpisah (skema hukumnya beda dari SPK-AK biasa yang
-- asumsinya "JAMAAH berangkat sendiri").
ALTER TABLE users ADD COLUMN agama ENUM('islam','non_islam') NULL;

-- Dokumen baru: Surat Perjanjian Referral Non-Muslim (spk_ak_nonis) —
-- mirror PERSIS pipeline spk_ak (2 rangkap TTD digital + e-materai wajib,
-- pasal-based/admin-editable via /admin/pasal). Pasal-nya SENGAJA gak
-- di-seed di sini — redaksi legal buat dokumen bermaterai ini wajib
-- ditulis/direview admin dari nol lewat /admin/pasal, bukan hasil copy
-- otomatis dari spk_ak (asumsi "JAMAAH berangkat sendiri" gak cocok).
ALTER TABLE dokumen_signature
  MODIFY COLUMN dokumen ENUM('spka_ins','jamaah','formulir','invoice','spk_ak','sk_cif','surat_pemblokiran','spk_ak_nonis') NOT NULL;

ALTER TABLE dokumen_pasal
  MODIFY COLUMN dokumen ENUM('spka_ins','jamaah','spk_ak','sk_cif','surat_pemblokiran','spk_ak_nonis') NOT NULL;

ALTER TABLE dokumen_pasal_snapshot
  MODIFY COLUMN dokumen ENUM('spka','spka_ins','spkl','jamaah','spk_ak','sk_cif','surat_pemblokiran','spk_ak_nonis') NOT NULL;

ALTER TABLE dokumen_signer_snapshot
  MODIFY COLUMN dokumen ENUM('spka','spka_ins','spkl','jamaah','spk_ak','sk_cif','surat_pemblokiran','spk_ak_nonis') NOT NULL;

-- Nomor surat sendiri (terpisah dari no_spk_ak) — dokumen legal beda,
-- gak boleh numpang nomor SPK-AK biasa.
ALTER TABLE users ADD COLUMN no_spk_ak_nonis VARCHAR(30) NULL;
