-- Dokumen yang udah terkirim (TTU/Kwitansi) WAJIB beku total -- tanggal,
-- nama paket, siapa yang TTD, semuanya -- gak boleh ikut berubah lagi
-- walau kode render/pengaturan perusahaan berubah belakangan (dikonfirmasi
-- user 2026-10-14). jamaah_breakdown_snapshot (migration 224) cuma
-- ngebekuin DATA mentahnya; render HTML-nya sendiri tetap pakai komponen
-- React TERKINI tiap halaman dibuka, jadi kalau komponennya kena bugfix/
-- redesign, tampilan dokumen LAMA ikut berubah juga -- itu yang gak
-- diinginkan. html_snapshot nyimpen HASIL RENDER PERSIS pas tombol "Kirim
-- ke Jamaah" diklik (server-side renderToStaticMarkup, lihat POST
-- .../setuju) -- begitu ada, halaman cetak nampilin INI apa adanya,
-- bukan render ulang dari data.
ALTER TABLE invoice_kwitansi
  ADD COLUMN html_snapshot LONGTEXT NULL AFTER jamaah_breakdown_snapshot;
