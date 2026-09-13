-- ============================================================
-- MIGRATION: Surat Kuasa Kerjasama Multi CIF pada BSI Cash Management
-- (dokumen ke-3 program Sejuta Baitullah, setelah SPK-AK & SK-CIF) +
-- voucher approval gate.
--
-- Dokumen ini dari BSI: jamaah (Pemberi Kuasa, individu) memberi kuasa ke
-- JM Travel (Penerima Kuasa, diwakili 1 orang) buat akses+debit rekening
-- tabungan umroh mereka di BSI Cash Management. BEDA dari SK-CIF (yang
-- cuma 1 pihak TTD, si jamaah doang) — surat ini 2 pihak TTD (jamaah DAN
-- wakil JM Travel), makanya PERLU signer institusi kayak spk_ak/spka_ins,
-- TAPI tetap wajib fisik+materai asli (dikirim ke BSI) kayak sk_cif —
-- gak masuk skema SATU_PIHAK, tapi juga gak dapat renderer PDF react-pdf,
-- polanya digabung dari keduanya (lihat pasalUntukCetak.js/pasalSnapshot.js
-- utk gimana ini dibedain dari kombinasi lama itu).
--
-- Wajib diisi + upload scan-nya SEBELUM status pendaftaran koperasi bisa
-- 'active' (dikonfirmasi user), sejajar sama syarat SK-CIF yang sudah ada.
-- ============================================================

-- 1) Nomor surat resmi (kolom freeze sendiri, pola sama no_spk_ak/no_sk_cif
-- — lihat komentar nomorSurat.js kenapa harus kolom terpisah) + path scan
-- fisik yang diupload jamaah.
ALTER TABLE users
  ADD COLUMN no_surat_kuasa_cif VARCHAR(50) NULL AFTER no_sk_cif,
  ADD COLUMN dokumen_surat_kuasa_cif_fisik_path VARCHAR(255) NULL AFTER dokumen_cif_fisik_diterima_at,
  ADD COLUMN dokumen_surat_kuasa_cif_fisik_uploaded_at TIMESTAMP NULL AFTER dokumen_surat_kuasa_cif_fisik_path;

-- 2) Penandatangan KHUSUS buat dokumen ini (bukan reuse nama_penandatangan
-- yang dipakai SPKA-Ins/SPK-AK/dll — dikonfirmasi user 2026-09-01, wakil
-- JM Travel yang tanda tangan Surat Kuasa BSI ini orangnya beda). Template
-- BSI juga minta No. Identitas si wakil (dokumen signer lain gak butuh ini).
ALTER TABLE pengaturan
  ADD COLUMN nama_penandatangan_kuasa_cif VARCHAR(150) NULL,
  ADD COLUMN identitas_penandatangan_kuasa_cif VARCHAR(30) NULL,
  ADD COLUMN jabatan_penandatangan_kuasa_cif VARCHAR(150) NULL;

-- 3) dokumen_signer_snapshot butuh kolom identitas baru (dokumen lain yang
-- sudah ada cukup nama+jabatan, gak pernah butuh nomor identitas signer).
ALTER TABLE dokumen_signer_snapshot
  ADD COLUMN identitas VARCHAR(30) NULL AFTER jabatan;

-- 4) Daftarkan 'surat_kuasa_cif' ke 4 tabel yang pakai ENUM dokumen (HARUS
-- semua, bukan cuma sebagian — lihat catatan pasalUntukCetak.js/
-- pasalSnapshot.js/admin/pasal/route.js soal 3 tempat yang harus sinkron).
ALTER TABLE dokumen_signature
  MODIFY COLUMN dokumen ENUM('spka_ins','jamaah','formulir','invoice','spk_ak','sk_cif','surat_kuasa_cif') NOT NULL;

ALTER TABLE dokumen_pasal
  MODIFY COLUMN dokumen ENUM('spka_ins','jamaah','spk_ak','sk_cif','surat_kuasa_cif') NOT NULL;

ALTER TABLE dokumen_pasal_snapshot
  MODIFY COLUMN dokumen ENUM('spka','spka_ins','spkl','jamaah','spk_ak','sk_cif','surat_kuasa_cif') NOT NULL;

ALTER TABLE dokumen_signer_snapshot
  MODIFY COLUMN dokumen ENUM('spka','spka_ins','spkl','jamaah','spk_ak','sk_cif','surat_kuasa_cif') NOT NULL;

-- 5) Voucher approval gate — dikonfirmasi user 2026-09-01: voucher Rp1jt
-- Sejuta Baitullah sekarang AUTO-generate sistem pas status jadi 'active'
-- (bukan admin bikin manual dari nol lagi), tapi tetap butuh admin ACC
-- manual sebelum valid dipakai checkout (kroscek data bener/gak). Voucher
-- yang dibuat manual oleh admin lewat form (POST /api/admin/vouchers)
-- otomatis dianggap sudah di-ACC (admin yang bikin = admin yang approve),
-- cuma voucher auto-generate ini yang lahir dengan disetujui_at NULL.
--
-- Voucher LAMA yang sudah ada di database sebelum migrasi ini dianggap
-- sudah disetujui (backfill dari created_at) — supaya voucher yang sudah
-- pernah dibagikan ke jamaah gak mendadak invalid gara-gara kolom baru.
ALTER TABLE vouchers
  ADD COLUMN disetujui_at TIMESTAMP NULL AFTER aktif;

UPDATE vouchers SET disetujui_at = created_at WHERE disetujui_at IS NULL;
