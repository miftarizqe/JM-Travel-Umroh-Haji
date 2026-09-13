USE jm_travel;

-- Nama & jabatan penandatangan PIHAK PERTAMA (SPKA/SPKA-Ins/SPKL) — sebelumnya
-- hardcode "Ahmad Zaky Arief Bestary" di 7 tempat berbeda di kode. Sekarang
-- jadi bagian Pengaturan Umum, tapi TETAP ikut dibekukan per dokumen (lihat
-- dokumen_signer_snapshot) supaya ganti penandatangan gak mengubah dokumen
-- yang sudah beku.
ALTER TABLE pengaturan
  ADD COLUMN nama_penandatangan VARCHAR(150) AFTER fb_url,
  ADD COLUMN jabatan_penandatangan VARCHAR(150) AFTER nama_penandatangan;

UPDATE pengaturan SET
  nama_penandatangan = 'Ahmad Zaky Arief Bestary',
  jabatan_penandatangan = 'Direktur Pengembangan Bisnis & Sumber Daya Manusia'
WHERE id = 1;

-- Snapshot isi pasal per dokumen legal — dibekukan SEKALI per dokumen resmi
-- (ref_id = users.id untuk SPKA/SPKA-Ins/SPKL, ref_id = bookings.id untuk
-- perjanjian jamaah), diisi otomatis lewat lib/pasalSnapshot.js pada momen
-- "resmi jadi" dokumen itu:
--   - SPKA/SPKA-Ins/SPKL: saat nomor surat pertama kali digenerate/dibuka
--     (lihat /api/admin/cetak-pks/[user_id], sudah ada freeze nomor surat
--     di situ — snapshot pasal numpang di momen yang sama).
--   - Perjanjian Jamaah: saat jamaah klik "Setuju" di /pks (lihat /api/pks).
-- Sesudah baris snapshot ada, dokumen itu SELAMANYA pakai isi ini walau
-- pasal aslinya (dokumen_pasal) diedit admin nanti. /pks (baca sebelum
-- setuju) TIDAK pernah baca dari sini — selalu tampilkan versi terbaru.
CREATE TABLE IF NOT EXISTS dokumen_pasal_snapshot (
  ref_id VARCHAR(64) NOT NULL,
  dokumen ENUM('spka', 'spka_ins', 'spkl', 'jamaah') NOT NULL,
  nomor INT NOT NULL,
  judul VARCHAR(255) NOT NULL,
  isi MEDIUMTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ref_id, dokumen, nomor)
);

-- Snapshot nama & jabatan penandatangan — cuma buat spka/spka_ins/spkl
-- (jamaah gak punya konsep "penandatangan PIHAK PERTAMA" di halaman cetak).
CREATE TABLE IF NOT EXISTS dokumen_signer_snapshot (
  ref_id VARCHAR(64) NOT NULL,
  dokumen ENUM('spka', 'spka_ins', 'spkl', 'jamaah') NOT NULL,
  nama VARCHAR(150),
  jabatan VARCHAR(150),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ref_id, dokumen)
);
