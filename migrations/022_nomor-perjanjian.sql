-- Nomor Surat Perjanjian Kerjasama (agen/perwakilan) — nomor formal
-- (format: NN.XXXX/JMT.<JENIS>.<ROMAWI>/YYYY) di-generate SEKALI saat surat
-- pertama kali dicetak admin, lalu dibekukan permanen di users.
-- Counter terpisah per jenis surat (SPKA utk agen, dst), mulai dari 1.
ALTER TABLE users
  ADD COLUMN no_perjanjian_kerjasama VARCHAR(50) NULL;

CREATE TABLE IF NOT EXISTS nomor_surat_counter (
  jenis VARCHAR(20) PRIMARY KEY,
  urutan INT NOT NULL DEFAULT 0
);
