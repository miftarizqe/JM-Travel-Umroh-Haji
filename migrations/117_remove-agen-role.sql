-- ============================================================
-- MIGRATION: Penghapusan role "agen" dan sistem Leader
-- Kebijakan kemitraan baru: hanya "perwakilan" yang tersisa.
-- Data akun agen (100 user + 1 Leader) sudah dihapus manual
-- sebelum migration ini dijalankan (lihat backup di scratchpad).
-- Jalankan: mysql -u root -p jm_travel < migration-remove-agen-role.sql
-- ============================================================

-- 1) Tabel khusus agen: drop total
DROP TABLE IF EXISTS program_agen;
DROP TABLE IF EXISTS agen_harga_reseller;

-- 2) bookings: kolom referral_agen_id sudah tidak dipakai (di-null-kan manual sebelumnya)
--    DROP COLUMN otomatis membuang index yang menempel di kolom itu
ALTER TABLE bookings
  DROP COLUMN referral_agen_id;

-- 3) agen_pendaftaran: tabel bersama agen+perwakilan, tetap ada,
--    hanya kolom & enum khusus agen yang dibuang
ALTER TABLE agen_pendaftaran
  DROP COLUMN bukti_setoran_bsi_path,
  DROP COLUMN bukti_setoran_bsi_nama,
  DROP COLUMN bukti_setoran_bsi_uploaded_at;

ALTER TABLE agen_pendaftaran
  MODIFY COLUMN role_diajukan ENUM('perwakilan') NOT NULL DEFAULT 'perwakilan';

-- 4) users: kolom khusus agen/Leader
ALTER TABLE users
  DROP COLUMN agen_aktif_sejak,
  DROP COLUMN sudah_berangkat_umroh,
  DROP COLUMN is_leader,
  DROP COLUMN leader_sejak;

ALTER TABLE users
  MODIFY COLUMN role ENUM('jamaah','perwakilan','admin','super_admin') NOT NULL;

-- 5) programs: kolom komisi agen/Leader/override
ALTER TABLE programs
  DROP COLUMN komisi_deluxe,
  DROP COLUMN komisi_eksekutif,
  DROP COLUMN komisi_signature,
  DROP COLUMN bsi_deluxe,
  DROP COLUMN bsi_eksekutif,
  DROP COLUMN bsi_signature,
  DROP COLUMN leader_deluxe,
  DROP COLUMN leader_eksekutif,
  DROP COLUMN leader_signature,
  DROP COLUMN override_l1,
  DROP COLUMN override_l2,
  DROP COLUMN override_l3;

ALTER TABLE programs
  MODIFY COLUMN publish_type ENUM('public','perwakilan','private') DEFAULT 'public';

-- 6) komisi_ledger: jenis khusus agen/Leader sudah dihapus datanya,
--    ramping-kan enum jadi hanya jalur reseller_perwakilan yang aktif
ALTER TABLE komisi_ledger
  MODIFY COLUMN jenis ENUM('reseller_perwakilan') NOT NULL;

-- 7) dokumen_pasal: dokumen spka (agen) dan spkl (Leader) sudah tidak berlaku
DELETE FROM dokumen_pasal WHERE dokumen IN ('spka','spkl');
ALTER TABLE dokumen_pasal
  MODIFY COLUMN dokumen ENUM('spka_ins','jamaah') NOT NULL;

-- 8) vouchers: akses_role khusus agen tidak ada baris tersisa (dicek Fase 0 audit = 0),
--    langsung ramping-kan enum
ALTER TABLE vouchers
  MODIFY COLUMN akses_role ENUM('publik','perwakilan','akun') NOT NULL DEFAULT 'publik';

-- 9) landing_page_teks: konten landing page khusus kemitraan agen
DELETE FROM landing_page_teks
  WHERE kunci IN (
    'kemitraan_agen_hook',
    'kemitraan_agen_items',
    'kemitraan_agen_judul',
    'kemitraan_modal_agen_benefit',
    'kemitraan_modal_agen_simulasi'
  );

-- 10) cashflow_kategori: rename kategori "Komisi/Ujroh Agen" -> "Komisi/Ujroh"
--     (bukan hapus, karena ujroh perwakilan juga mengalir lewat kategori ini)
UPDATE cashflow_kategori SET nama = 'Komisi/Ujroh' WHERE nama = 'Komisi/Ujroh Agen';
