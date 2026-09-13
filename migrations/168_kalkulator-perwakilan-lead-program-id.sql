-- Link-back dari ajuan Kalkulator Perwakilan yang sudah disetujui ke Program
-- eksklusif yang dibuat admin dari quote itu (dikonfirmasi user 2026-09-03).
-- Diisi otomatis oleh POST /api/admin/programs saat body.from_lead_id dikirim
-- (dari alur "Buat Program Eksklusif dari Quote Ini" di halaman detail lead)
-- — bukan wajib diisi manual, dan TIDAK mengubah cara program dibuat lewat
-- jalur biasa (tanpa from_lead_id, kolom ini tetap NULL selamanya).
-- Jalankan: mysql -u root -p jm_travel < migration-kalkulator-perwakilan-lead-program-id.sql
ALTER TABLE kalkulator_perwakilan_lead
  ADD COLUMN program_id VARCHAR(36) NULL,
  ADD FOREIGN KEY (program_id) REFERENCES programs(id);
