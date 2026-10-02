-- Ganti auto-seed/sinkron kalkulator dari HARDCODE nama kelompok
-- (KELOMPOK_BASELINE di kode) jadi FLAG EKSPLISIT per item (dikonfirmasi
-- user 2026-10-02 — admin bisa bikin kategori/item baru kapan saja lewat
-- "+ Tambah Kategori Baru", nama kelompok gak bisa diandalkan buat
-- nge-hardcode di kode; terbukti nyata: data produksi pakai "Cost
-- Transportasi"/"Cost Jakarta (Via Management JM Travel)", beda ejaan dari
-- "Cost Transportation"/"Cost Jakarta (Via Management)" yang di-hardcode,
-- bikin 2 dari 3 kelompok gagal total ke-auto-seed/sinkron di produksi).
--
-- baseline_umroh/baseline_wisata: 1 = item ini otomatis ditarik ke
-- kalkulator BARU (atau lewat tombol "Sinkronkan dari Master") untuk jenis
-- program yang bersangkutan. kelompok TETAP bebas (cuma label tampilan),
-- gak lagi menentukan perilaku auto-seed sama sekali.
ALTER TABLE biaya_master_item
  ADD COLUMN baseline_umroh TINYINT NOT NULL DEFAULT 0,
  ADD COLUMN baseline_wisata TINYINT NOT NULL DEFAULT 0;

-- Migrasi data lama: set flag berdasarkan nama kelompok yang SAAT INI
-- kepakai (termasuk varian ejaan beda antara lokal & produksi), biar
-- perilaku PERSIS SAMA kayak sebelum migrasi ini buat item yang udah ada —
-- admin cuma perlu urus checkbox ini buat item BARU ke depannya.
UPDATE biaya_master_item SET baseline_umroh = 1
WHERE kelompok IN (
  'Cost Saudi (Via Mutawwif)',
  'Cost Jakarta (Via Management)', 'Cost Jakarta (Via Management JM Travel)',
  'Cost Transportation', 'Cost Transportasi',
  'Handling Alfiyah', 'Cost Tour Leader'
);

UPDATE biaya_master_item SET baseline_wisata = 1
WHERE kelompok IN ('Cost Jakarta (Via Management)', 'Cost Jakarta (Via Management JM Travel)')
  AND nama NOT IN ('Fee Ustad Manasik Umroh', 'Akses Mekkah - Madinnah - Haramain Express', 'Perlengkapan Jamaah');
