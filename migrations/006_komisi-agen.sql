-- ============================================================
-- MIGRATION LANGKAH 1 — Skema Komisi Agen (Lampiran I resmi)
-- Jalankan sekali di MySQL, database: jm_travel
--
-- Mapping paket -> bintang hotel (dikonfirmasi):
--   signature = Bintang 5, eksekutif = Bintang 4, deluxe = Bintang 3
--
-- Aturan (per jamaah):
--   Bintang 5: komisi 4.000.000 (BSI 1.000.000 / pribadi 3.000.000)
--   Bintang 4: komisi 3.000.000 (BSI 1.000.000 / pribadi 2.000.000)
--   Bintang 3: komisi 1.500.000 (BSI   500.000 / pribadi 1.000.000)
--   Komisi Leader: B5 1.000.000, B4 1.000.000, B3 500.000
--   Override berjenjang (sama semua paket): L1 250.000, L2 150.000, L3 100.000
-- ============================================================

-- 1) Kategori program: skema komisi HANYA berlaku untuk group_resmi
ALTER TABLE programs
  ADD COLUMN kategori ENUM('group_resmi','perwakilan','korporasi','private')
    DEFAULT 'group_resmi' AFTER type;

-- 2) Komisi per paket (disimpan eksplisit agar manajemen bisa mengubah)
--    Paket signature = B5, eksekutif = B4, deluxe = B3
ALTER TABLE programs
  -- Komisi closing agen (utuh, per jamaah)
  ADD COLUMN komisi_deluxe      BIGINT DEFAULT 1500000 AFTER kategori,
  ADD COLUMN komisi_eksekutif   BIGINT DEFAULT 3000000 AFTER komisi_deluxe,
  ADD COLUMN komisi_signature   BIGINT DEFAULT 4000000 AFTER komisi_eksekutif,
  -- Porsi ke tabungan BSI (sisanya ke rekening pribadi)
  ADD COLUMN bsi_deluxe         BIGINT DEFAULT  500000 AFTER komisi_signature,
  ADD COLUMN bsi_eksekutif      BIGINT DEFAULT 1000000 AFTER bsi_deluxe,
  ADD COLUMN bsi_signature      BIGINT DEFAULT 1000000 AFTER bsi_eksekutif,
  -- Komisi Leader per jamaah (dari jaringan bawah), termasuk dalam fee program
  ADD COLUMN leader_deluxe      BIGINT DEFAULT  500000 AFTER bsi_signature,
  ADD COLUMN leader_eksekutif   BIGINT DEFAULT 1000000 AFTER leader_deluxe,
  ADD COLUMN leader_signature   BIGINT DEFAULT 1000000 AFTER leader_eksekutif,
  -- Override berjenjang (sama untuk semua paket)
  ADD COLUMN override_l1        BIGINT DEFAULT  250000 AFTER leader_signature,
  ADD COLUMN override_l2        BIGINT DEFAULT  150000 AFTER override_l1,
  ADD COLUMN override_l3        BIGINT DEFAULT  100000 AFTER override_l2;

-- 3) Penanda agen: setelah berangkat umroh, porsi BSI tidak dipotong lagi
ALTER TABLE users
  ADD COLUMN sudah_berangkat_umroh TINYINT DEFAULT 0 AFTER tabungan_bsi,
  ADD COLUMN is_leader TINYINT DEFAULT 0 AFTER sudah_berangkat_umroh,
  ADD COLUMN leader_sejak DATE DEFAULT NULL AFTER is_leader;

-- 4) Ledger komisi — audit trail tiap pembayaran komisi
CREATE TABLE IF NOT EXISTS komisi_ledger (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id VARCHAR(36) NOT NULL,
  penerima_id VARCHAR(36) NOT NULL,     -- user penerima komisi
  penerima_nama VARCHAR(150),
  jenis ENUM('closing_pribadi','closing_bsi','override_l1','override_l2','override_l3','leader') NOT NULL,
  jumlah_jamaah INT DEFAULT 1,
  nominal BIGINT NOT NULL,
  paket VARCHAR(30),
  keterangan VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_booking (booking_id),
  INDEX idx_penerima (penerima_id)
);

-- 5) Program lama: pastikan kategori terisi
UPDATE programs SET kategori = 'group_resmi' WHERE kategori IS NULL;
