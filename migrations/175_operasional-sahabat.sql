-- Jenis baru 'operasional_sahabat' di komisi_ledger (dikonfirmasi user
-- 2026-09-06). Dari Rp1.000.000 setoran pendaftaran Sahabat Baitullah:
-- 700rb (Gen1-5) + 100rb (Head of Program) + 100rb (tabungan awal jemaah)
-- = 900rb sudah tercatat lewat jenis lain. Sisa 100rb (buat operasional
-- kantor) sebelumnya SAMA SEKALI gak ada baris ledger-nya. Ditambah juga:
-- Head of Program SELALU cuma dapet flat 100rb, gak peduli dia ada di
-- posisi gen mana pun di rantai perekrut — kalau kebetulan HOP ada di
-- rantai (misal dia rekrut langsung = Gen1), nominal gen itu DIALIHKAN ke
-- sini (operasional_sahabat), bukan dibayar dobel ke HOP.
ALTER TABLE komisi_ledger MODIFY jenis ENUM(
  'reseller_perwakilan','komisi_sahabat','closing_langsung_sahabat',
  'tabungan_awal_sahabat','head_of_program_registrasi','pemakaian_saldo_sahabat',
  'setoran_mandiri_sahabat','ujroh_perwakilan','referral_closing_reguler_sahabat',
  'operasional_sahabat'
) NOT NULL;
