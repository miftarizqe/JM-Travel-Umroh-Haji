-- Biaya tambahan linear per modul negara (Visa, Tips Guide, Porter, dkk) —
-- BEDA dari modul_negara_tier (yang itu bracket per-jumlah-jamaah). Addon ini
-- rate tetap × qty, qty-nya tergantung `basis`:
--   per_pax      = (pax_jamaah + pax_tl)
--   per_pax_hari = (pax_jamaah + pax_tl) × hari modul (dari modul_tambahan.hari)
--   per_hari     = hari modul aja, gak dikali pax
--   flat         = 1x aja (per kloter/rombongan, gak dikali apa-apa)
CREATE TABLE modul_negara_addon (
  id INT AUTO_INCREMENT PRIMARY KEY,
  modul_negara_id INT NOT NULL,
  nama VARCHAR(100) NOT NULL,
  mata_uang ENUM('SAR','USD','IDR') NOT NULL DEFAULT 'USD',
  harga_per_unit DECIMAL(14,2) NOT NULL DEFAULT 0,
  basis ENUM('per_pax','per_pax_hari','per_hari','flat') NOT NULL DEFAULT 'per_pax',
  urutan INT NOT NULL DEFAULT 0,
  aktif TINYINT NOT NULL DEFAULT 1,
  FOREIGN KEY (modul_negara_id) REFERENCES modul_negara(id) ON DELETE CASCADE
);

-- Seed 3 addon yang tarifnya SAMA & gak ambigu di semua 5 modul (dari
-- spreadsheet asli): Tips Guide $5/pax/hari, Porter Kedatangan Airport
-- $8/pax, Porter Hotel $4/pax. Visa/Flight surcharge SENGAJA gak di-seed
-- otomatis (ada beberapa pilihan tarif tergantung tipe, bukan 1 angka tetap
-- — biar admin yang tambahin manual + pilih mana yang aktif).
INSERT INTO modul_negara_addon (modul_negara_id, nama, mata_uang, harga_per_unit, basis, urutan)
SELECT id, 'Tips Guide', 'USD', 5, 'per_pax_hari', 0 FROM modul_negara;
INSERT INTO modul_negara_addon (modul_negara_id, nama, mata_uang, harga_per_unit, basis, urutan)
SELECT id, 'Porter Kedatangan Airport', 'USD', 8, 'per_pax', 1 FROM modul_negara;
INSERT INTO modul_negara_addon (modul_negara_id, nama, mata_uang, harga_per_unit, basis, urutan)
SELECT id, 'Porter Hotel', 'USD', 4, 'per_pax', 2 FROM modul_negara;
