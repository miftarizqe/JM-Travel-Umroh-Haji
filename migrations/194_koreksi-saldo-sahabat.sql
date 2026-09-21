-- Jenis baru 'koreksi_saldo_sahabat' di komisi_ledger (dikonfirmasi user
-- 2026-09-21) — super_admin manual mengurangi saldo tabungan umroh Jamaah
-- Sahabat Baitullah lewat /admin/sahabat/database, buat koreksi kalau ada
-- kesalahan input sebelumnya. SELALU nominal negatif, append-only (baris
-- baru per koreksi, gak pernah edit/hapus baris lama).
ALTER TABLE komisi_ledger MODIFY jenis ENUM(
  'reseller_perwakilan','komisi_sahabat','closing_langsung_sahabat',
  'tabungan_awal_sahabat','head_of_program_registrasi','pemakaian_saldo_sahabat',
  'setoran_mandiri_sahabat','ujroh_perwakilan','referral_closing_reguler_sahabat',
  'operasional_sahabat','koreksi_saldo_sahabat'
) NOT NULL;
