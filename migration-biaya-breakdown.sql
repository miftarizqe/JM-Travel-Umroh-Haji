-- Kalkulator biaya/budgeting program — 1 struktur dipakai buat 2 kebutuhan:
-- template yang bisa dipakai ulang (is_template=1, program_id NULL) ATAU
-- breakdown biaya yang nempel ke program beneran (program_id terisi).
-- Simulasi bebas yang gak pernah disimpan gak butuh row di sini sama sekali
-- (cuma hidup di state React sampai user pilih "Simpan Template"/simpan
-- program).
--
-- Hotel dikutip per KAMAR per malam (bukan per orang) — HPP per orang beda
-- tergantung isi kamar (quad/triple/double), makanya tarif+malam hotel
-- disimpan sebagai 1 angka lalu dibagi kapasitas kamar pas dihitung, bukan
-- diketik manual 3x. Item biaya lain (tiket, visa, handling, dll) rata flat
-- per orang, ditaruh di biaya_breakdown_item.
CREATE TABLE IF NOT EXISTS biaya_breakdown (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nama VARCHAR(150) NOT NULL,
  is_template TINYINT NOT NULL DEFAULT 0,
  program_id VARCHAR(36) NULL,
  paket ENUM('deluxe','eksekutif','signature') NULL,
  hotel_mekkah_rate BIGINT NOT NULL DEFAULT 0,
  hotel_mekkah_malam INT NOT NULL DEFAULT 0,
  hotel_madinah_rate BIGINT NOT NULL DEFAULT 0,
  hotel_madinah_malam INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (program_id),
  FOREIGN KEY (program_id) REFERENCES programs(id)
);

CREATE TABLE IF NOT EXISTS biaya_breakdown_item (
  id INT AUTO_INCREMENT PRIMARY KEY,
  breakdown_id INT NOT NULL,
  kategori VARCHAR(100) NOT NULL,
  nominal_per_pax BIGINT NOT NULL DEFAULT 0,
  urutan INT NOT NULL DEFAULT 0,
  FOREIGN KEY (breakdown_id) REFERENCES biaya_breakdown(id) ON DELETE CASCADE
);
