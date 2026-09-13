-- Rebrand total: role/program "koperasi" (brand lama "Sejuta Baitullah")
-- diganti "Sahabat Baitullah" di mana pun, termasuk internal (nilai enum,
-- nama tabel/kolom) — dikonfirmasi user 2026-09-06, momen paling aman
-- karena app belum deploy (belum ada trafik/data eksternal yang bisa rusak).
--
-- Pola tiap enum: WIDEN (tambah nilai baru, nilai lama tetap valid) ->
-- UPDATE baris lama ke nilai baru -> NARROW (buang nilai lama). Ini WAJIB
-- 3 langkah terpisah, bukan langsung ganti definisi enum, karena baris yang
-- masih pakai nilai lama akan DITOLAK/dipotong diam-diam kalau enum
-- dipersempit sebelum datanya sendiri diupdate.
--
-- Jalankan: mysql -u root -p jm_travel < migration-rebrand-sahabat-baitullah.sql

-- ===== 1. users.role & role_kedua =====
ALTER TABLE users
  MODIFY COLUMN role enum('jamaah','perwakilan','admin','super_admin','koperasi','sahabat_baitullah') NOT NULL,
  MODIFY COLUMN role_kedua enum('perwakilan','koperasi','sahabat_baitullah') NULL
    COMMENT 'Role kedua akun ini (selain role utama) - perwakilan+sahabat_baitullah, direkrut langsung manajemen.';

UPDATE users SET role = 'sahabat_baitullah' WHERE role = 'koperasi';
UPDATE users SET role_kedua = 'sahabat_baitullah' WHERE role_kedua = 'koperasi';

ALTER TABLE users
  MODIFY COLUMN role enum('jamaah','perwakilan','admin','super_admin','sahabat_baitullah') NOT NULL,
  MODIFY COLUMN role_kedua enum('perwakilan','sahabat_baitullah') NULL
    COMMENT 'Role kedua akun ini (selain role utama) - perwakilan+sahabat_baitullah, direkrut langsung manajemen.';

-- ===== 2. users: kolom kode_invite_koperasi & perekrut_koperasi_jamaah_id =====
ALTER TABLE users DROP INDEX kode_invite_koperasi;
ALTER TABLE users CHANGE COLUMN kode_invite_koperasi kode_invite_sahabat VARCHAR(10) NULL
  COMMENT 'Kode acak (BUKAN kode_unik yg sekuensial) buat gerbang wajib pendaftaran Jamaah Sahabat Baitullah baru - mirror kode_invite_perwakilan.';
ALTER TABLE users ADD UNIQUE INDEX kode_invite_sahabat (kode_invite_sahabat);

ALTER TABLE users RENAME COLUMN perekrut_koperasi_jamaah_id TO perekrut_sahabat_jamaah_id;
ALTER TABLE users RENAME INDEX idx_users_perekrut_koperasi_jamaah TO idx_users_perekrut_sahabat_jamaah;

-- ===== 3. komisi_ledger.jenis =====
ALTER TABLE komisi_ledger
  MODIFY COLUMN jenis enum(
    'reseller_perwakilan','komisi_koperasi','closing_langsung_koperasi','tabungan_awal_sejuta',
    'head_of_program_registrasi','pemakaian_saldo_sejuta','setoran_mandiri_sejuta','ujroh_perwakilan',
    'referral_closing_reguler_koperasi',
    'komisi_sahabat','closing_langsung_sahabat','tabungan_awal_sahabat',
    'pemakaian_saldo_sahabat','setoran_mandiri_sahabat','referral_closing_reguler_sahabat'
  ) NOT NULL;

UPDATE komisi_ledger SET jenis = 'komisi_sahabat' WHERE jenis = 'komisi_koperasi';
UPDATE komisi_ledger SET jenis = 'closing_langsung_sahabat' WHERE jenis = 'closing_langsung_koperasi';
UPDATE komisi_ledger SET jenis = 'tabungan_awal_sahabat' WHERE jenis = 'tabungan_awal_sejuta';
UPDATE komisi_ledger SET jenis = 'pemakaian_saldo_sahabat' WHERE jenis = 'pemakaian_saldo_sejuta';
UPDATE komisi_ledger SET jenis = 'setoran_mandiri_sahabat' WHERE jenis = 'setoran_mandiri_sejuta';
UPDATE komisi_ledger SET jenis = 'referral_closing_reguler_sahabat' WHERE jenis = 'referral_closing_reguler_koperasi';

ALTER TABLE komisi_ledger
  MODIFY COLUMN jenis enum(
    'reseller_perwakilan','komisi_sahabat','closing_langsung_sahabat','tabungan_awal_sahabat',
    'head_of_program_registrasi','pemakaian_saldo_sahabat','setoran_mandiri_sahabat','ujroh_perwakilan',
    'referral_closing_reguler_sahabat'
  ) NOT NULL;

-- ===== 4. pengaturan: nominal komisi & 5-generasi =====
ALTER TABLE pengaturan RENAME COLUMN komisi_koperasi_nominal TO komisi_sahabat_nominal;
ALTER TABLE pengaturan RENAME COLUMN komisi_koperasi_closing_persen TO komisi_sahabat_closing_persen;
ALTER TABLE pengaturan RENAME COLUMN sejuta_gen1_nominal TO sahabat_gen1_nominal;
ALTER TABLE pengaturan RENAME COLUMN sejuta_gen2_nominal TO sahabat_gen2_nominal;
ALTER TABLE pengaturan RENAME COLUMN sejuta_gen3_nominal TO sahabat_gen3_nominal;
ALTER TABLE pengaturan RENAME COLUMN sejuta_gen4_nominal TO sahabat_gen4_nominal;
ALTER TABLE pengaturan RENAME COLUMN sejuta_gen5_nominal TO sahabat_gen5_nominal;
ALTER TABLE pengaturan RENAME COLUMN sejuta_tabungan_awal_nominal TO sahabat_tabungan_awal_nominal;
ALTER TABLE pengaturan RENAME COLUMN sejuta_head_of_program_nominal TO sahabat_head_of_program_nominal;
ALTER TABLE pengaturan RENAME COLUMN sejuta_closing_langsung_hop_nominal TO sahabat_closing_langsung_hop_nominal;

-- ===== 5. metode_pembayaran.khusus_koperasi =====
ALTER TABLE metode_pembayaran RENAME COLUMN khusus_koperasi TO khusus_sahabat;

-- ===== 6. programs.publish_type =====
ALTER TABLE programs MODIFY COLUMN publish_type enum('public','perwakilan','private','koperasi','sahabat_baitullah') NOT NULL DEFAULT 'public';
UPDATE programs SET publish_type = 'sahabat_baitullah' WHERE publish_type = 'koperasi';
ALTER TABLE programs MODIFY COLUMN publish_type enum('public','perwakilan','private','sahabat_baitullah') NOT NULL DEFAULT 'public';

-- ===== 7. perlengkapan_jamaah.kategori_program =====
ALTER TABLE perlengkapan_jamaah MODIFY COLUMN kategori_program enum('umum','sejuta_baitullah','sahabat_baitullah') NOT NULL DEFAULT 'umum';
UPDATE perlengkapan_jamaah SET kategori_program = 'sahabat_baitullah' WHERE kategori_program = 'sejuta_baitullah';
ALTER TABLE perlengkapan_jamaah MODIFY COLUMN kategori_program enum('umum','sahabat_baitullah') NOT NULL DEFAULT 'umum';

-- ===== 8. rekening_ledger.rekening =====
ALTER TABLE rekening_ledger MODIFY COLUMN rekening enum('alkhalid','sejuta_baitullah','sahabat_baitullah') NOT NULL;
UPDATE rekening_ledger SET rekening = 'sahabat_baitullah' WHERE rekening = 'sejuta_baitullah';
ALTER TABLE rekening_ledger MODIFY COLUMN rekening enum('alkhalid','sahabat_baitullah') NOT NULL;

-- ===== 9. pendaftaran_status_log.tipe =====
ALTER TABLE pendaftaran_status_log MODIFY COLUMN tipe enum('perwakilan','koperasi','sahabat_baitullah') NOT NULL;
UPDATE pendaftaran_status_log SET tipe = 'sahabat_baitullah' WHERE tipe = 'koperasi';
ALTER TABLE pendaftaran_status_log MODIFY COLUMN tipe enum('perwakilan','sahabat_baitullah') NOT NULL;

-- ===== 10. bookings.referral_koperasi_id =====
ALTER TABLE bookings RENAME COLUMN referral_koperasi_id TO referral_sahabat_id;
ALTER TABLE bookings RENAME INDEX idx_bookings_referral_koperasi TO idx_bookings_referral_sahabat;

-- ===== 11. Rename tabel =====
RENAME TABLE koperasi_pendaftaran TO sahabat_pendaftaran;
RENAME TABLE materi_koperasi TO materi_sahabat;
RENAME TABLE materi_koperasi_slide TO materi_sahabat_slide;
