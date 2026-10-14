-- Tanda Terima Uang (TTU) gak boleh ikut berubah lagi begitu udah "Kirim ke
-- Jamaah" (dikonfirmasi user 2026-10-14) -- sebelumnya kontennya (qty/
-- daftar jamaah) dihitung ULANG tiap kali halaman dibuka, jadi TTU buat DP
-- 1 yang udah lama dikirim bisa keliatan "berubah" begitu booking yang sama
-- nambah jamaah belakangan. jamaah_breakdown_snapshot dibekukan PERSIS pas
-- tombol "Kirim ke Jamaah" diklik (POST .../setuju) -- sesudahnya GET
-- selalu baca dari sini, gak ngitung ulang lagi.
ALTER TABLE invoice_kwitansi
  ADD COLUMN jamaah_breakdown_snapshot JSON NULL AFTER scan_fisik_uploaded_at;

-- Bug ditemukan pas ngerjain ini (2026-10-14): terkirim_metode ENUM cuma
-- punya ('digital','fisik'), TAPI POST /api/admin/invoice-kwitansi/[id]/setuju
-- udah lama nulis 'setuju' ke kolom ini -- di SQL strict mode (default di
-- sini) itu bikin UPDATE-nya ERROR, bukan diam2 kepotong. Artinya tombol
-- "Setuju" buat dokumen <Rp5jt kemungkinan besar gagal diam2 dari awal.
ALTER TABLE invoice_kwitansi
  MODIFY COLUMN terkirim_metode ENUM('digital','fisik','setuju') DEFAULT NULL;
