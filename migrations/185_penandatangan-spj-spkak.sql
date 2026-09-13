-- SPJ (Perjanjian Keberangkatan Jamaah) & SPK-AK naik status jadi dokumen
-- 2-pihak (dulu SPJ satu-pihak, SPK-AK sudah 3-pihak tapi Pihak Ketiga-nya
-- salah — pakai Perekrut generik, seharusnya Head of Program) — dikonfirmasi
-- user 2026-09-09:
--   - SPJ: Jamaah + Management kantor JM Travel (baru, sebelumnya cuma
--     Jamaah doang yang TTD, gak ada pihak JM Travel di dokumen).
--   - SPK-AK: Jamaah + Head of Program + Management kantor. Penandatangan
--     Management-nya SENGAJA field terpisah dari "Penandatangan Umum" SPK-PWK
--     (beda orang boleh beda), dan SEKARANG 2 rangkap + materai silang
--     persis SPK-PWK (RANGKAP_SPKA_INS di materaiRule.js, lihat
--     RANGKAP_SPK_AK yang baru).
ALTER TABLE pengaturan
  ADD COLUMN nama_penandatangan_jamaah VARCHAR(150) NULL,
  ADD COLUMN jabatan_penandatangan_jamaah VARCHAR(150) NULL,
  ADD COLUMN nama_penandatangan_spk_ak VARCHAR(150) NULL,
  ADD COLUMN jabatan_penandatangan_spk_ak VARCHAR(150) NULL;
