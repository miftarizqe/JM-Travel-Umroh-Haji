-- ============================================================
-- MIGRATION: Dukungan 2 rangkap + 2 materai (cross-signing) khusus
-- SPKA-Ins. Pola fisik yang sudah jalan sekarang: 2 rangkap dicetak,
-- masing-masing bermaterai SENDIRI (total 2 materai, bukan 1 dipakai
-- 2x) — rangkap yang BALIK ke JM Travel materainya di-TTD PERWAKILAN
-- (pihak luar), rangkap yang TINGGAL di PERWAKILAN materainya di-TTD
-- JM TRAVEL. Dokumen lain (jamaah/formulir/invoice) tetap 1 sesi
-- ('tunggal') seperti sebelumnya — kolom rangkap cuma dipakai spka_ins.
--
-- Formulir Pendaftaran DIKONFIRMASI tidak pakai materai sama sekali
-- (lihat src/lib/materaiRule.js) — tidak ada perubahan skema untuk itu,
-- cuma perbaikan logic di kode.
--
-- Jalankan: mysql -u root -p jm_travel < migration-ttd-materai-rangkap.sql
-- ============================================================

ALTER TABLE dokumen_signature
  ADD COLUMN rangkap ENUM('tunggal','travel','luar') NOT NULL DEFAULT 'tunggal' AFTER ref_id,
  DROP INDEX uniq_dokumen_ref,
  ADD UNIQUE KEY uniq_dokumen_ref_rangkap (dokumen, ref_id, rangkap);
