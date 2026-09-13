USE jm_travel;

-- Memo Internal No. 00014/JM-IM/07.26 (efektif 1 Agustus 2026): agen wajib
-- berangkat umroh sendiri dalam 1 tahun sejak jadi agen aktif (ini soal agen
-- itu sendiri, BUKAN soal jemaah yang ia daftarkan). Kolom ini mengikuti pola
-- persis `leader_sejak DATE` (lihat migration-komisi-agen.sql) — deadline
-- dihitung di kode sebagai agen_aktif_sejak + 1 tahun.
ALTER TABLE users ADD COLUMN agen_aktif_sejak DATE DEFAULT NULL;

-- Backfill best-effort buat agen yang sudah aktif sebelum kolom ini ada —
-- pakai created_at sebagai proksi (mungkin sedikit meleset dari tanggal
-- approve asli, tapi lebih baik daripada NULL / dianggap belum pernah aktif).
UPDATE users SET agen_aktif_sejak = DATE(created_at)
  WHERE role = 'agen' AND status = 'active' AND agen_aktif_sejak IS NULL;
