-- Surat Kuasa Multi CIF BSI Cash Management (surat_kuasa_cif) DIHAPUS TOTAL
-- dari sistem — dikonfirmasi user 2026-09-09: cuma SK-CIF yang beneran
-- dipakai buat urusan CIF, bukan 2 dokumen kayak sebelumnya. Belum ada data
-- real yang pakai dokumen ini (app belum deploy), jadi aman dihapus bersih
-- (kode + kolom database), bukan cuma disembunyikan di UI.
--
-- Urutan dokumen wajib fisik+materai Sahabat Baitullah sekarang jadi 3:
-- SPK-AK -> SK-CIF -> Surat Pemblokiran -> active.

-- 1) Hapus isi pasal-nya dulu (biar ENUM MODIFY di bawah gak nabrak baris
-- yang masih pakai value ini).
DELETE FROM dokumen_pasal WHERE dokumen = 'surat_kuasa_cif';
DELETE FROM dokumen_pasal_snapshot WHERE dokumen = 'surat_kuasa_cif';
DELETE FROM dokumen_signer_snapshot WHERE dokumen = 'surat_kuasa_cif';
DELETE FROM dokumen_signature WHERE dokumen = 'surat_kuasa_cif';

-- 2) Copot 'surat_kuasa_cif' dari 4 ENUM dokumen.
ALTER TABLE dokumen_signature
  MODIFY COLUMN dokumen ENUM('spka_ins','jamaah','formulir','invoice','spk_ak','sk_cif','surat_pemblokiran') NOT NULL;

ALTER TABLE dokumen_pasal
  MODIFY COLUMN dokumen ENUM('spka_ins','jamaah','spk_ak','sk_cif','surat_pemblokiran') NOT NULL;

ALTER TABLE dokumen_pasal_snapshot
  MODIFY COLUMN dokumen ENUM('spka','spka_ins','spkl','jamaah','spk_ak','sk_cif','surat_pemblokiran') NOT NULL;

ALTER TABLE dokumen_signer_snapshot
  MODIFY COLUMN dokumen ENUM('spka','spka_ins','spkl','jamaah','spk_ak','sk_cif','surat_pemblokiran') NOT NULL;

-- 3) Kolom users terkait surat_kuasa_cif.
ALTER TABLE users
  DROP COLUMN no_surat_kuasa_cif,
  DROP COLUMN dokumen_surat_kuasa_cif_fisik_path,
  DROP COLUMN dokumen_surat_kuasa_cif_fisik_uploaded_at;

-- 4) Kolom penandatangan khusus di pengaturan.
ALTER TABLE pengaturan
  DROP COLUMN nama_penandatangan_kuasa_cif,
  DROP COLUMN identitas_penandatangan_kuasa_cif,
  DROP COLUMN jabatan_penandatangan_kuasa_cif;

-- 5) Kolom dokumen_signer_snapshot.identitas — SATU-SATUNYA dokumen yang
-- pernah butuh No. Identitas signer institusi adalah surat_kuasa_cif, jadi
-- ikut dicopot.
ALTER TABLE dokumen_signer_snapshot
  DROP COLUMN identitas;
